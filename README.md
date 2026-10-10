# Pizza queue

A shared order queue for a pizza shop, built with Angular. Everything runs in the browser: there is no backend.

1. **Create a queue** on the home page and share the link with your team.
2. **Orders**: tap pizzas, add notes and send the order to the kitchen. The customer gets an order number.
3. **Kitchen**: start an order (in the oven) and mark it ready when it's baked.
4. **Counter**: mark baked orders "Ready for customer" and open the **customer screen**, which shows the numbers that can be collected (with a chime) and the ones still being prepared. Mark an order "Picked up" to clear it from the screen.

## How syncing works

Browsers talk to each other directly over WebRTC, using the free [PeerJS](https://peerjs.com) cloud server only to find each other. The browser that created the queue is the host: it keeps the orders (saved in its local storage) and sends every change to everyone else.

- Keep the creator's tab open while the shop is running. Reloading it is fine; closing it pauses syncing until it's opened again.
- Other devices reconnect automatically.
- To use your own PeerJS server, add `?signal=host:port` to the URL before the `#`.

## Develop

Needs Node 22.22.3+ or 24.15+.

```bash
npm install
npm start          # http://localhost:4200
npm test -- --watch=false
npm run build      # output in dist/order-queue/browser
```

## Publish on GitHub Pages

`.github/workflows/deploy.yml` builds and publishes the site on every push to `main`. In the repository settings, under **Pages**, set **Source** to **GitHub Actions** once. The site is then at `https://<user>.github.io/order-queue/`.
