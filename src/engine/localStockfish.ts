// localStockfish.ts
//
// محرك Stockfish يشتغل بالكامل في المتصفح (Web Worker) — منقول من analysis18.html.
// الفكرة: بدل ما EngineEval.tsx يبعت fetch لـ /evaluate ويستنى السيرفر يشغّل
// المحرك كل مرة، المحرك ده بيتحمّل مرة واحدة كـ Worker محلي وبيرجّع نتائج
// الـ MultiPV أول بأول (كل ما العمق يزيد) — من غير أي round-trip للسيرفر، وده اللي
// بيخليه أسرع بكتير من نسخة الـ backend.
//
// الاستخدام من أي component:
//   localStockfish.analyze(fen, { multipv: 2, depth: 24 }, (lines) => setLines(lines));
//   localStockfish.stop();

// المحرك بقى محفوظ محليًا جوه المشروع (public/stockfish.js) بدل ما يتقرا
// كل مرة من صفحة GitHub Pages خارجية — نفس فكرة fetch()+Blob Worker لسه
// شغالة زي ما هي (مفيش داعي نغيرها، بتشتغل مع أي مسار سواء محلي أو خارجي)،
// بس دلوقتي المصدر بقى ملف ثابت جوه مجلد public/ في المشروع نفسه، فمفيش
// أي اعتماد على الإنترنت أو حساب GitHub بتاعك وقت التشغيل.
// ملحوظة: لازم الملف يكون فعليًا جوه مجلد public/ (مش أي مكان تاني)
// عشان Vite يقدر يقدّمه كملف ثابت على هذا المسار.
const STOCKFISH_URL = '/stockfish.js';

export interface EngineLine {
  depth: number;
  score: number;          // بالبيضة (pawns) — من منظور اللاعب اللي دوره يلعب في الـ FEN المُرسل
  mateIn?: number | null; // لو فيه كش-ميت إجباري
  pv: string;              // نقلات UCI مفصولة بمسافة، مثال: "e2e4 e7e5 g1f3"
}

type LinesCallback = (lines: EngineLine[]) => void;
export interface EngineStats {
  nps: number;
  seldepth: number;
}
type StatsCallback = (stats: EngineStats) => void;

interface RawInfo {
  depth?: number;
  multipv?: number;
  scoreType?: 'cp' | 'mate';
  scoreVal?: number;
  pv?: string[];
  nps?: number;
  seldepth?: number;
}

class LocalStockfish {
  private worker: Worker | null = null;
  private uciOk = false;
  private readyOk = false;
  private engineBusy = false;

  private pendingFen: string | null = null;
  private pendingMultiPV = 2;
  private pendingDepth = 24;
  private pendingThreads = 1;

  private currentMultiPV = 2;
  private currentThreads = 1;
  private linesMap: Record<number, EngineLine> = {};
  private listener: LinesCallback | null = null;
  private statsListener: StatsCallback | null = null;

  private initPromise: Promise<void> | null = null;
  private initError: string | null = null;

  /** يبدأ تحميل المحرك مرة واحدة بس (singleton) — أي استدعاء تاني بيرجع نفس الـ promise */
  init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      fetch(STOCKFISH_URL)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status} fetching engine script`);
          return res.text();
        })
        .then((script) => {
          this.worker = new Worker(STOCKFISH_URL);

          this.worker.onerror = (err) => {
            this.initError = err.message;
            reject(err);
          };
          this.worker.onmessage = (event: MessageEvent) => this.handleMessage(event.data);

          this.worker.postMessage('uci');

          const poll = setInterval(() => {
            if (this.readyOk) {
              clearInterval(poll);
              resolve();
            }
          }, 50);

          setTimeout(() => {
            if (!this.uciOk) {
              clearInterval(poll);
              reject(new Error('Engine handshake timed out (لم يستجب المحرك لأمر uci)'));
            }
          }, 20000);
        })
        .catch(reject);
    });

    return this.initPromise;
  }

  get isReady() {
    return this.readyOk;
  }

  get lastError() {
    return this.initError;
  }

  private handleMessage(line: string) {
    if (!line || typeof line !== 'string') return;

    // مصافحة UCI: مينفعش نبعت setoption/isready غير بعد uciok، ومينفعش نبدأ
    // تحليل غير بعد ما readyok ترجع
    if (line === 'uciok') {
      this.uciOk = true;
      this.worker!.postMessage(`setoption name MultiPV value ${this.currentMultiPV}`);
      this.worker!.postMessage('isready');
      return;
    }
    if (line === 'readyok') {
      this.readyOk = true;
      return;
    }

    // البحث ميخلصش فعليًا غير لما "bestmove" توصل. لو طلب تحليل جديد وصل والمحرك
    // لسه مشغول، بنستنى الـ bestmove ده وبعدين نبدأ البحث المطلوب فعلاً
    if (line.indexOf('bestmove') === 0) {
      this.engineBusy = false;
      if (this.pendingFen !== null) {
        const fen = this.pendingFen;
        const multipv = this.pendingMultiPV;
        const depth = this.pendingDepth;
        const threads = this.pendingThreads;
        this.pendingFen = null;
        this.startSearchInternal(fen, multipv, depth, threads);
      }
      return;
    }

    if (line.indexOf('info') === 0 && line.includes(' multipv ') && line.includes(' pv ')) {
      const info = this.parseInfoLine(line);
      if (info.pv && info.pv.length) this.updateLine(info);
      if (info.nps != null && this.statsListener) {
        this.statsListener({ nps: info.nps, seldepth: info.seldepth ?? info.depth ?? 0 });
      }
    }
  }

  private parseInfoLine(line: string): RawInfo {
    const tokens = line.split(' ');
    const result: RawInfo = {};
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === 'depth') result.depth = parseInt(tokens[++i], 10);
      else if (tokens[i] === 'multipv') result.multipv = parseInt(tokens[++i], 10);
      else if (tokens[i] === 'score') {
        result.scoreType = tokens[++i] as 'cp' | 'mate';
        result.scoreVal = parseInt(tokens[++i], 10);
      } else if (tokens[i] === 'nps') result.nps = parseInt(tokens[++i], 10);
      else if (tokens[i] === 'seldepth') result.seldepth = parseInt(tokens[++i], 10);
      else if (tokens[i] === 'pv') {
        result.pv = tokens.slice(i + 1);
        break;
      }
    }
    return result;
  }

  private updateLine(info: RawInfo) {
    const id = info.multipv || 1;
    const existing = this.linesMap[id];
    // نحتفظ بأعمق نتيجة بس لكل سطر (نفس منطق analysis18.html)
    if (existing && existing.depth > (info.depth ?? 0)) return;

    const isMate = info.scoreType === 'mate';
    this.linesMap[id] = {
      depth: info.depth || 0,
      score: isMate ? (info.scoreVal! > 0 ? 99 : -99) : (info.scoreVal ?? 0) / 100,
      mateIn: isMate ? info.scoreVal ?? null : null,
      pv: (info.pv || []).join(' '),
    };
    this.emit();
  }

  private emit() {
    if (!this.listener) return;
    const keys = Object.keys(this.linesMap)
      .map(Number)
      .sort((a, b) => a - b);
    this.listener(keys.map((k) => this.linesMap[k]));
  }

  private startSearchInternal(fen: string, multipv: number, depth: number, threads: number) {
    this.engineBusy = true;
    this.linesMap = {};
    if (multipv !== this.currentMultiPV) {
      this.currentMultiPV = multipv;
      this.worker!.postMessage(`setoption name MultiPV value ${multipv}`);
    }
    if (threads !== this.currentThreads) {
      this.currentThreads = threads;
      this.worker!.postMessage(`setoption name Threads value ${threads}`);
    }
    this.worker!.postMessage('position fen ' + fen);
    this.worker!.postMessage('go depth ' + depth);
  }

  /**
   * يطلب تحليل موقف جديد. لو المحرك لسه بيحمّل، بينتظر ويحاول تاني تلقائيًا.
   * لو في بحث شغال أصلاً، بيوقفه ويبدأ الجديد أول ما الـ bestmove ترجع
   * (نفس فكرة pendingFen في analysis18.html) — كده أول موقف مطلوب دايمًا هو
   * اللي بيتحلل، مش الموقف اللي كان قبله.
   */
  analyze(
    fen: string,
    opts: { multipv?: number; depth?: number; threads?: number } = {},
    onLines: LinesCallback,
    onStats?: StatsCallback,
  ) {
    this.listener = onLines;
    this.statsListener = onStats ?? null;
    const multipv = opts.multipv ?? 2;
    const depth = opts.depth ?? 24;
    const threads = opts.threads ?? 1;

    if (!this.worker || !this.readyOk) {
      this.init()
        .then(() => this.analyze(fen, opts, onLines, onStats))
        .catch(() => {
          /* الخطأ بيتلقط من status في الـ component عن طريق isReady/lastError */
        });
      return;
    }

    if (this.engineBusy) {
      this.pendingFen = fen;
      this.pendingMultiPV = multipv;
      this.pendingDepth = depth;
      this.pendingThreads = threads;
      this.linesMap = {};
      this.worker.postMessage('stop');
      return;
    }

    this.startSearchInternal(fen, multipv, depth, threads);
  }

  /** يوقف أي بحث شغال ويلغي الـ listener الحالي (مثلاً لما الـ component يتفكك أو المستخدم يوقف المحرك) */
  stop() {
    this.listener = null;
    this.statsListener = null;
    this.pendingFen = null;
    if (this.worker && this.readyOk) {
      try {
        this.worker.postMessage('stop');
      } catch {
        /* no-op */
      }
    }
  }
}

// singleton واحد للتطبيق كله — نفس الـ Worker بيتشارك بين أي عدد من مرات فتح EngineEval
export const localStockfish = new LocalStockfish();
