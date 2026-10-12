import { Component, OnInit, input } from '@angular/core';
import { followLink } from '../follow-app';

/**
 * Following an order moved to its own app. An order link from before that (#/track/<id>)
 * goes there straight away, without showing anything of this staff app.
 */
@Component({
  selector: 'app-track-moved',
  template: '',
})
export class TrackMoved implements OnInit {
  readonly order = input.required<string>();

  ngOnInit() {
    window.location.replace(followLink(this.order()));
  }
}
