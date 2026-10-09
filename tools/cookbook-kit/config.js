// Settings for your Family Cookbook.
// 1. In Supabase, copy your Project URL and your anon (public) key.
// 2. Paste them below between the quote marks, replacing PASTE_...
// The key is meant to be public: only you can change recipes when signed in, and family
// can only use the secret family link the cookbook makes for you.
window.PLANNER_CONFIG = {
  sync: {
    url: 'PASTE_YOUR_PROJECT_URL_HERE',
    key: 'PASTE_YOUR_ANON_KEY_HERE'
  },
  cookbookOwner: 'Me',                       // your first name (shows when you change a recipe)
  cookbookFooter: 'Made with love 💛',        // the line at the bottom of the cookbook
  storageKey: 'familyCookbook'
};
