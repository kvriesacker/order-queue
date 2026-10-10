# Pizza queue

A shared order queue for a pizza shop, built with Angular. Everything runs in the browser: there is no backend.

1. **Create a queue**: tick the pizzas you sell, add your own and give each a color. Share the link with your team. The host can change the menu later under **Menu**.
2. **Orders**: tap pizzas, add notes and send the order to the kitchen. The customer gets an order number.
3. **Kitchen**: every pizza has its own row in its menu color. Put pizzas in the oven and mark them ready one by one; the order goes to the counter once all its pizzas are ready.
4. **Counter**: mark baked orders "Ready for customer" and open the **customer screen**, which shows the numbers that can be collected (with a chime) and the ones still being prepared. Mark an order "Picked up" to clear it from the screen.

## How syncing works

Devices sync through a free public MQTT broker ([HiveMQ](https://www.hivemq.com/mqtt/public-mqtt-broker/)) over a secure WebSocket, so it works on any network, including mobile data. Everything sent is end-to-end encrypted with a key derived from the queue link, so the broker only sees a scrambled topic name and ciphertext.

The browser that created the queue is the host: it keeps the orders (saved in its local storage), applies every change and publishes the latest queue.

- Keep the creator's tab open while the shop is running. If it closes, everyone still sees the last queue, and new orders and changes are delivered when it's back.
- Other devices reconnect automatically.
- To use another broker, add `?broker=wss://host:port/path` to the URL before the `#`.

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
