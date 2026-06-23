/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the app is a client-side SPA (static prerender + client-side
  // fetch to Supabase), so it ships as plain static files — ideal for Azure Static
  // Web Apps. `next build` emits the site to ./out.
  //
  // Trade-off: this disables SSR / route handlers / server actions. The app needs
  // none of those (all backend logic lives in Supabase edge functions). If SSR is
  // ever required, drop `output: 'export'` and host on Azure App Service / a
  // container running `next start` instead.
  output: 'export',
  images: { unoptimized: true },
};

export default nextConfig;
