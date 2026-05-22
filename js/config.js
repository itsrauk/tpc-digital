const SUPABASE_URL = 'https://szuawpslksgzzayeuytv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6dWF3cHNsa3NnenpheWV1eXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMzYzODksImV4cCI6MjA5NDkxMjM4OX0.47VX0EQsMDfd-eYidXZnG1bvL-Ya39HsagskMh5a10c';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
