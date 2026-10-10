# Pizza queue

A shared order queue for a pizza shop, built with Angular. Everything runs in the browser: there is no backend.

1. **Create a queue**: tick the pizzas you sell, add your own and give each a color, and set starting times for each phase (prepare, bake, counter). Share the link with your team. The host can change these later under **Settings**.
2. **Orders**: tap pizzas (each one gets its own line and note) and send the order to the kitchen. The customer gets an order number.
3. **Kitchen**: every pizza has its own row in its menu color, with its note. Mark each pizza **Prepared** when it's ready for the oven.
4. **Oven**: prepared pizzas show up here. Mark each one **Baked**; the order goes to the counter once all its pizzas are baked.
5. **Counter**: mark baked orders "Ready for customer" and open the **customer screen**, which shows the numbers that can be collected with the name and pizzas (and a chime) and, for every order still being made, the customer's name, the pizzas (types and counts, without notes) and the estimated ready time. Mark an order "Picked up" to clear it from the screen.

## Estimated ready times

Every open order shows an estimated ready time on each screen, including the customer screen. The estimate is split into three phases:

- **Prepare**: the kitchen makes pizzas one after another in order of arrival.
- **Bake**: each prepared pizza spends the bake time in the oven (several fit at once).
- **Counter**: after an order's last pizza is baked, the counter needs a moment to call it.

The host sets a starting time for each phase. As pizzas are marked prepared and baked and orders are called, each phase learns its real pace from the last hour, so a faster kitchen pulls every estimate earlier and a slow oven pushes them later. Settings shows the times in use right now.

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
