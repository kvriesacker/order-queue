# Pizza queue

A shared order queue for a pizza shop, built with Angular. Everything runs in the browser: there is no backend.

1. **Create a queue**: tick the pizzas you sell, add your own and give each a color, and set starting times for each phase (prepare, bake, counter), how many ovens you have and, if you like, how many pizzas you can make in total and a maximum per pizza (when an ingredient is limited). Share the link with your team. The host can change these later under **Settings**.
2. **Orders**: with a maximum set, the order page and the top bar show how many pizzas are still available, and an order can never go over it (not even when two people take orders at the same time). Pizzas with a maximum show how many are left, and sold-out pizzas can't be tapped. Cancelled orders free their pizzas again. Tap pizzas (each one gets its own line and note) and send the order to the kitchen. The customer gets an order number. Open the **customer screen** (button next to "New order") on a display facing the customer, in another window or on another device. It says "Next customer" until the order taker adds a pizza, then shows the order live as it's taken, with a QR code ("Scan me to follow your order") that opens a page on the customer's phone following that one order until it's ready. Once sent, the screen shows the order number and ready time; **Show QR code again** brings the QR code back.
3. **Kitchen**: every pizza has its own row in its menu color, with its note. Mark each pizza **Prepared** when it's ready for the oven. Under **Pizzas left** the kitchen sees how many of each pizza it can still make, and changes that number (or presses **Sold out**) as it counts its ingredients. Ordered pizzas it hasn't prepared yet count as part of that number, so new orders don't change it but preparing a pizza does. The maximum follows: what's prepared plus what's left, and the order page shows what can still be sold.
4. **Oven**: prepared pizzas show up here. Mark each one **Baked**; the order goes to the counter once all its pizzas are baked. At the top, each oven shows the pizzas in it (prepared pizzas fill the working ovens in the order they came from the kitchen). **Mark out of order** takes an oven out of the estimates until it's **Working again**. Kitchen and Oven both list the pizzas they marked last (**Just prepared** / **Just baked**) with an **Undo**, so a mistake can be fixed even after the order has left the list.
5. **Counter**: mark baked orders "Ready for customer" and open the **customer screen**, which shows every order in one of four blocks: **Ordered**, **Being prepared** (the kitchen has prepared its first pizza), **Baking** (all its pizzas are prepared, or the first one is baked) and **Ready! Please collect** (in green, with a chime). Each order shows its number, the customer's name and the pizzas (types and counts, without notes), plus the estimated ready time until it's ready. Mark an order "Picked up" to clear it from the screen.

## Statistics

The **Stats** tab shows what was sold: pizzas per type, the busiest 15 minutes, how long prepare, bake and counter really took compared with the settings, the average wait, cancellations, the most asked-for notes and when the pizzas sold out. A "For next time" list turns those into tips. **Download CSV** saves one row per pizza for a spreadsheet, so the numbers survive after the queue ends.

## Estimated ready times

Every open order shows an estimated ready time on each screen, including the customer screen. The estimate is split into three phases:

- **Prepare**: the kitchen makes pizzas one after another in order of arrival.
- **Bake**: each prepared pizza goes into the first free oven spot and bakes for the bake time. The host sets how many ovens there are and how many pizzas fit in each; when the ovens are full, pizzas wait their turn.
- **Counter**: after an order's last pizza is baked, the counter needs a moment to call it.

The host sets a starting time for each phase. As pizzas are marked prepared and baked and orders are called, each phase learns its real pace from the last hour, so a faster kitchen pulls every estimate earlier and a slow oven pushes them later. Settings shows the times in use right now.

## How syncing works

Devices sync through a free public MQTT broker ([HiveMQ](https://www.hivemq.com/mqtt/public-mqtt-broker/)) over a secure WebSocket, so it works on any network, including mobile data. Everything sent is end-to-end encrypted with a key derived from the queue link, so the broker only sees a scrambled topic name and ciphertext.

The browser that created the queue is the host: it keeps the orders (saved in its local storage), applies every change and publishes the latest queue.

- Keep the creator's tab open while the shop is running. If it closes, everyone still sees the last queue (every staff device keeps a copy), and new orders and changes are delivered when it's back.
- If the host's device is gone for good, anyone on the Orders, Kitchen, Oven or Counter tabs can press **Become host** in the "host is offline" message. Devices that press it at the same time agree on exactly one new host, so order numbers and the pizza limit stay right. When the old host comes back, it sees the newer queue and joins as a normal device instead of overwriting it.
- Other devices reconnect automatically.
- The QR code link only lets someone follow their own order: the host publishes each order's status separately, encrypted with a key derived from the order id, so the queue link is never shared with customers.
- To use another broker, add `?broker=wss://host:port/path` to the URL before the `#`.

## Develop

Needs Node 22.22.3+ or 24.15+.

```bash
npm install
npm start          # http://localhost:4200
npm test -- --watch=false
npm run build      # output in dist/order-queue/browser
npm run e2e        # browser tests against the build (run npm run build first)
```

The deploy workflow runs the unit tests and the browser tests, and only publishes when both pass.

## Publish on GitHub Pages

`.github/workflows/deploy.yml` builds and publishes the site on every push to `main`. In the repository settings, under **Pages**, set **Source** to **GitHub Actions** once. The site is then at `https://<user>.github.io/order-queue/`.
