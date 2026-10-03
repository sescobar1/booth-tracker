// Settings for the Planner app (calendar, tasks, notes and documents).
window.PLANNER_CONFIG = {
  // Same Supabase project as the Booth Tracker, Band Volunteers and Money, so the same email and password work.
  // The anon key is meant to be public; Row Level Security keeps every row and file private to the account.
  sync: { url: 'https://mxcwtyubndlsudejizld.supabase.co', key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14Y3d0eXVibmRsc3VkZWppemxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NjY0NDQsImV4cCI6MjEwNjU0MjQ0NH0.brgHxbLjCdKmQyH0i3gj4UdKiQqhOJFGyhifK3FU5t8' },
  bucket: 'planner',
  storageKey: 'plannerApp'
};
