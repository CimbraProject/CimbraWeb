// Cliente de Supabase compartido. La anon key es pública por diseño
// (Supabase la protege vía Row Level Security, no por secretismo);
// nunca pongas aquí la service_role key.
const SUPABASE_URL = 'https://vvhrqajhbopxcltvpwif.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2aHJxYWpoYm9weGNsdHZwd2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MTE5OTYsImV4cCI6MjEwMjI4Nzk5Nn0.vN6dCY5jX_rvZdXjTMQKMm-AMnTALsTUcRxV72sLPfM';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
