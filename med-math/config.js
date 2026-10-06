// Settings for Med Math practice.
window.MEDMATH_CONFIG = {
  // Same Supabase project as the Booth Tracker, so the instructor signs in on teacher.html with the same email and password.
  // The anon key is meant to be public. Students can only hand in grades; only the owner account can read them.
  sync: { url: 'https://mxcwtyubndlsudejizld.supabase.co', key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14Y3d0eXVibmRsc3VkZWppemxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NjY0NDQsImV4cCI6MjEwNjU0MjQ0NH0.brgHxbLjCdKmQyH0i3gj4UdKiQqhOJFGyhifK3FU5t8' },
  ownerId: '2bce50b8-9628-4c3d-9bb1-c69fdc5d32da', // the instructor's account; grades go to this gradebook
  passing: 80,                                      // percent shown as passing
  storageKey: 'medMath'                             // where a student's progress saves on their device
};
