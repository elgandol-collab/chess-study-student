// Opens the app in a tab when the toolbar icon is clicked; opens the server-address page after install.
chrome.action.onClicked.addListener(function () {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html#__START__') });
});
chrome.runtime.onInstalled.addListener(function (d) {
  if (d.reason === 'install') chrome.runtime.openOptionsPage();
});
