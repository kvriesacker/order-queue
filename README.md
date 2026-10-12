# Pizza queue

A shared order queue for a pizza shop, built with Angular. Everything runs in the browser: there is no backend.

1. **Create a queue**: tick the pizzas you sell, add your own and give each a color, and set starting times for each phase (prepare, bake, counter), how many ovens you have and, if you like, how many pizzas you can make in total and a maximum per pizza (when an ingredient is limited). Set a **price per pizza** in euro and, where a pizza costs more or less, its own price (0 hides prices everywhere). Share the link with your team. Anyone on the team can change these later under **Settings**. Queues used on this device are listed under **Your queues** on the start page (newest first, with the date of the last order); **Remove** deletes an old one from this device, including its statistics.
2. **Orders**: with a maximum set, the order page and the top bar show how many pizzas are still available, and an order can never go over it (not even when two people take orders at the same time). Pizzas with a maximum show how many are left, and sold-out pizzas can't be tapped. Cancelled orders free their pizzas again. Tap pizzas (each one gets its own line and note) and send the order to the kitchen; each pizza button shows in a badge how many of it the order already has. Under the total the order taker sees when the order would be ready if sent now. On a wide screen the pizzas of the order being taken are listed on the right, next to the menu, totals and send button; on a phone everything stays in one column. **Open orders** (with Cancel for orders the kitchen hasn't started) slide in from the side only when you press that button. Below the order the order taker sees what each pizza type costs ("2 × €9.50 = €19.00") and the total to pay. The customer gets an order number. Open the **customer screen** (button next to "New order") on a display facing the customer, in another window or on another device. It says "Next customer" until the order taker adds a pizza, then shows the order live as it's taken, with the same price calculation and total, and a QR code ("Scan me to follow your order") that opens a page on the customer's phone following that one order until it's ready. Once sent, the screen shows the order number and ready time next to the same QR code until the next order starts; the order taker can **Hide QR code** (and show it again), or press **Next customer** once the customer has gone to put the screen back to "Next customer". While waiting for the next customer and while an order is taken, the bottom of the customer screen lists the pizzas on sale with their price; a pizza with 5 or fewer left shows "Only N left" (counting the order being taken), a sold-out one is crossed out with "Sold out", and when 5 or fewer pizzas are left in total it says "Only N pizzas left".
3. **Kitchen**: orders are listed one under the other, oldest on top, on any screen size. Every pizza has its own row in its menu color, with its note; within an order the pizzas are grouped by type, in menu order. Mark each pizza **Prepared** when it's ready for the oven. Under **Pizzas left** the kitchen sees how many of each pizza it can still make, and changes that number (or presses **Sold out**) as it counts its ingredients. Ordered pizzas it hasn't prepared yet count as part of that number, so new orders don't change it but preparing a pizza does. The maximum follows: what's prepared plus what's left, and the order page shows what can still be sold.
4. **Oven**: prepared pizzas show up here, one order under the other in the same order as the kitchen. Mark each one **Baked**; the order goes to the counter once all its pizzas are baked. Under **Ovens** in the side bar, **Mark out of order** takes an oven out of the estimates until it's **Working again**. Kitchen and Oven both list the pizzas they marked last (**Just prepared** / **Just baked**) with an **Undo**, so a mistake can be fixed even after the order has left the list.
5. **Counter**: mark baked orders "Ready for customer" and open the **customer screen**, which shows every order in one of four blocks: **Ordered**, **Being prepared** (the kitchen has prepared its first pizza), **Baking** (all its pizzas are prepared, or the first one is baked) and **Ready! Please collect** (in green, with a chime). Each order shows its number, the customer's name and the pizzas (types and counts, without notes), plus the estimated ready time until it's ready. Mark an order "Picked up" to clear it from the screen.

## Install as an app

Pizza queue is an installable web app. On Android, Chrome or Edge, press **Install app on this device** on the start page (or use the browser's install menu); on iPhone or iPad tap **Share**, then **Add to Home Screen**. It then opens from its own pizza icon without the browser bar, and the app itself is kept on the device so it opens even without a connection. Orders still need a connection to reach the other devices.

Customers following their order from the QR code can press **Alert me when it's baking and ready**: their phone then shows a notification, buzzes and beeps when the pizzas go into the oven and again when the order is ready to collect. This works while the order page stays open (also in the background); on an iPhone it needs the page added to the Home Screen.

## Statistics

The **Stats** tab shows what was sold: pizzas per type, revenue (when prices are set), the busiest 15 minutes, how long prepare, bake and counter really took compared with the settings, the average wait, cancellations, the most asked-for notes and when the pizzas sold out. A "For next time" list turns those into tips. **Download CSV** saves one row per pizza (with its price) for a spreadsheet, so the numbers survive after the queue ends.

## Estimated ready times

Every open order shows an estimated ready time on each screen, including the customer screen. The estimate is split into three phases:

- **Prepare**: the kitchen makes pizzas one after another in order of arrival.
- **Bake**: each prepared pizza goes into the first free oven spot and bakes for the bake time. Settings say how many ovens there are and how many pizzas fit in each; when the ovens are full, pizzas wait their turn.
- **Counter**: after an order's last pizza is baked, the counter needs a moment to call it.

Settings give a starting time for each phase. As pizzas are marked prepared and baked and orders are called, each phase learns its real pace from the last hour, so a faster kitchen pulls every estimate earlier and a slow oven pushes them later. Settings shows the times in use right now. Taps that are too fast to be real (a pizza "baked" in a few seconds while trying the app out) are left out, and the learned times stay between a third of the setting and three times it.

## How syncing works

Every queue is stored in [Firebase](https://firebase.google.com/) (Cloud Firestore), so no device has to stay open: any device can start, leave or come back, and the queue carries on.

- The queue is one document. Each device applies its own changes in a transaction (read the queue, apply the change, save it), so two order takers at once still get different numbers and the pizza limit holds.
- Everything stored is end-to-end encrypted in the browser with a key derived from the queue link, under a hashed id. Firebase only sees ciphertext, and the rules in `firestore.rules` let only the app in (signed in anonymously) and don't allow listing queues.
- Every staff device keeps a copy of the queue, so it shows straight away and without internet. Changes made offline wait on the device (also across a reload) and are saved when it's back; an order taken offline gets its number then.
- The QR code link only lets someone follow their own order: each order's status is stored separately, encrypted with a key derived from the order id, so the queue link is never shared with customers.
- The Firebase project is set in `src/app/firebase-config.ts`. After changing `firestore.rules`, paste them in the Firebase console under Firestore Database → Rules.

## Develop

Needs Node 22.22.3+ or 24.15+.

```bash
npm install
npm start          # http://localhost:4200
npm test -- --watch=false
npm run build      # output in dist/order-queue/browser
npm run e2e        # browser tests against the build (run npm run build first)
```

The deploy workflow runs the unit tests and the browser tests, and only publishes when both pass. The browser tests start the local Firebase emulator (needs Java 21) with the real rules, and open the app with `?emulator=127.0.0.1`, so they never touch the real project. Several devices (Orders, Kitchen, Oven, Counter, each in its own browser) work on one queue, including the first device leaving, devices losing their connection, two order takers at once, and a customer following an order on their phone.

## Publish on GitHub Pages

`.github/workflows/deploy.yml` builds and publishes the site on every push to `main`. In the repository settings, under **Pages**, set **Source** to **GitHub Actions** once. The site is then at `https://<user>.github.io/order-queue/`.
