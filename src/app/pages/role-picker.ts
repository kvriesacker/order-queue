import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-role-picker',
  imports: [RouterLink],
  template: `
    <main class="page">
      <h1>What’s your job today?</h1>
      <div class="roles">
        <a class="card role" routerLink="take">
          <span class="role-icon" aria-hidden="true">📝</span>
          <strong>Take orders</strong>
          <span class="muted">Enter what the customer wants and send it to the kitchen.</span>
        </a>
        <a class="card role" routerLink="kitchen">
          <span class="role-icon" aria-hidden="true">👨‍🍳</span>
          <strong>Kitchen</strong>
          <span class="muted">Make the pizzas and mark each one prepared.</span>
        </a>
        <a class="card role" routerLink="oven">
          <span class="role-icon" aria-hidden="true">🔥</span>
          <strong>Oven</strong>
          <span class="muted">Bake the prepared pizzas and mark each one baked.</span>
        </a>
        <a class="card role" routerLink="counter">
          <span class="role-icon" aria-hidden="true">📣</span>
          <strong>Counter</strong>
          <span class="muted"
            >Box the baked pizzas, call the numbers and show them on the customer screen.</span
          >
        </a>
      </div>
    </main>
  `,
})
export class RolePicker {}
