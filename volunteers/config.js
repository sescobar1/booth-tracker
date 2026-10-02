// Settings for this copy of Band Volunteers.
window.VOL_CONFIG = {
  // Same Supabase project as the Booth Tracker, so the same email and password work here.
  // The anon key is meant to be public; Row Level Security keeps the data private to the signed-in account.
  sync: { url: 'https://mxcwtyubndlsudejizld.supabase.co', key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14Y3d0eXVibmRsc3VkZWppemxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NjY0NDQsImV4cCI6MjEwNjU0MjQ0NH0.brgHxbLjCdKmQyH0i3gj4UdKiQqhOJFGyhifK3FU5t8' },
  // Whose sign-up page signup.html shows when the link has no ?o=. Not a secret: the page can only
  // list open jobs and add sign-ups, never read phone numbers or emails.
  ownerId: '2bce50b8-9628-4c3d-9bb1-c69fdc5d32da',
  storageKey: 'bandVolunteers'      // where this copy saves on the device
};
