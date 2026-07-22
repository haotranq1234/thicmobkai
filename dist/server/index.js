export default {
  async fetch() {
    return new Response('ThicMobKai Converter is running.', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};
