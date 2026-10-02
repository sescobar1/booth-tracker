// Settings for this copy of Booth Tracker.
// The welcome setup asks for your name and booths; change them later under Import & backup -> Your booths.
window.BOOTH_CONFIG = {
  owner: '',
  storageKey: 'boothTrackerStarter',      // where this copy saves on the device
  docsDb: 'boothTrackerStarterDocs',      // where receipt photos are saved on the device
  startMonth: null,                       // month lists start in January of this year
  seedData: false,
  smartBooths: false,
  autoRent: true,                         // booth rent is added to each month automatically
  mileageFromJan: false,                  // scheduled trips start the week you set them up
  recipeCards: false,
  setup: true,                            // show the welcome setup the first time
  guideUrl: 'starter/guide.html',
  booths: [],
  cookieBooth: null,
  towns: [],
  routes: [],
  recipes: []
};
