import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { T } from '../i18n/i18n';

@Component({
  selector: 'app-role-picker',
  imports: [RouterLink, T],
  template: `
    <main class="page">
      <h1>{{ 'What’s your job today?' | t }}</h1>
      <div class="roles">
        <a class="card role" routerLink="take">
          <span class="role-icon" aria-hidden="true">📝</span>
          <strong>{{ 'Take orders' | t }}</strong>
          <span class="muted">{{ 'Enter what the customer wants and send it to the kitchen.' | t }}</span>
        </a>
        <a class="card role" routerLink="kitchen">
          <span class="role-icon" aria-hidden="true">👨‍🍳</span>
          <strong>{{ 'Kitchen' | t }}</strong>
          <span class="muted">{{ 'Make the pizzas and mark each one prepared.' | t }}</span>
        </a>
        <a class="card role" routerLink="oven">
          <span class="role-icon" aria-hidden="true">🔥</span>
          <strong>{{ 'Oven' | t }}</strong>
          <span class="muted">{{ 'Bake the prepared pizzas and mark each one baked.' | t }}</span>
        </a>
        <a class="card role" routerLink="counter">
          <span class="role-icon" aria-hidden="true">📣</span>
          <strong>{{ 'Counter' | t }}</strong>
          <span class="muted"
            >{{ 'Box the baked pizzas, call the numbers and show them on the customer screen.' | t }}</span
          >
        </a>
        <a class="card role" routerLink="order-screen">
          <span class="role-icon" aria-hidden="true">📱</span>
          <strong>{{ 'Customer order screen' | t }}</strong>
          <span class="muted"
            >{{
              'Faces the customer while ordering: their number, ready time and a code to follow it.'
                | t
            }}</span
          >
        </a>
      </div>
    </main>
  `,
})
export class RolePicker {}
