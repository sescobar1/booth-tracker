// Settings for Cecilia's Work Clock. Same Supabase project as Money and the Planner, so Mom signs in with the same email and password.
// The anon key is meant to be public; Row Level Security keeps the shifts and register private to Mom's account,
// so only Mom's account can see or change them.
window.WORK_CONFIG = {
  sync: { url: 'https://mxcwtyubndlsudejizld.supabase.co', key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14Y3d0eXVibmRsc3VkZWppemxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NjY0NDQsImV4cCI6MjEwNjU0MjQ0NH0.brgHxbLjCdKmQyH0i3gj4UdKiQqhOJFGyhifK3FU5t8' },
  kid: 'Cece',            // the family link (Planner → kid links) whose shifts these are
  kidName: 'Cecilia',     // what the pages call her
  rate: 10                // dollars per hour for new shifts
};
