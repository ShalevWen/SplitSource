export const createState = () => ({
  tab: null,
  pageUrl: null,
  fetchController: null,
  currentUrl: null,
  currentViewMode: null,
  fileSwapContext: null,
  docInfoReady: false,
  knownResourceUrls: new Set(),
  extras: [],
  pendingExtras: [],
});
