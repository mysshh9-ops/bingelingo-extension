// config.js
// Environment configurations for the BingeLingo extension backend connection.

export const CONFIG = {
  // Replace with your BingeLingo Lovable Edge Function URL
  // Example: "https://your-project-ref.supabase.co/functions/v1/process-session"
  BINGELINGO_FUNCTION_URL: "", 
  
  // Replace with your Supabase Anon/Public Key (DO NOT use the Service Role key!)
  SUPABASE_ANON_KEY: "",
  
  // Replace with the base URL of your Lovable frontend (for fallback redirects)
  BINGELINGO_APP_URL: "https://your-bingelingo-domain.com"
};
