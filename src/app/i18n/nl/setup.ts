/** The start page, the settings page, and the menu and timing editors. */
export const NL_SETUP: Record<string, string> = {
  // Start page
  'Take orders, bake them and call out the numbers, together on any device.':
    'Neem bestellingen op, bak ze en roep de nummers af, samen op elk toestel.',
  'Start a new queue': 'Start een nieuwe wachtrij',
  'Shop name': 'Naam van de zaak',
  'Pizzas on the menu': "Pizza's op het menu",
  'Untick what you don’t sell and pick a color for each pizza.':
    'Vink uit wat je niet verkoopt en kies een kleur voor elke pizza.',
  'Pizzas and ready times': "Pizza's en klaartijden",
  'Tick at least one pizza.': 'Vink minstens één pizza aan.',
  'Start queue': 'Wachtrij starten',
  'Join a queue': 'Deelnemen aan een wachtrij',
  'Link or code': 'Link of code',
  'https://…#/q/abc123 or abc123': 'https://…#/q/abc123 of abc123',
  Join: 'Deelnemen',
  'That doesn’t look like a queue link or code.': 'Dat lijkt geen link of code van een wachtrij.',
  'Your queues': 'Je wachtrijen',
  '{n} order': '{n} bestelling',
  '{n} orders': '{n} bestellingen',
  'no orders yet': 'nog geen bestellingen',
  Remove: 'Verwijderen',
  'Remove {name}': '{name} verwijderen',
  'Remove “{name}” from this device? Its orders and statistics on this device are deleted. Download the statistics first if you still need them.':
    '“{name}” van dit toestel verwijderen? De bestellingen en statistieken op dit toestel worden gewist. Download de statistieken eerst als je ze nog nodig hebt.',
  // Install
  'Install app on this device': 'App installeren op dit toestel',
  'To install this app on your iPhone or iPad: tap':
    'Om deze app op je iPhone of iPad te installeren: tik op',
  Share: 'Deel',
  ', then': ' en dan op',
  'Add to Home Screen': 'Zet op beginscherm',
  // Settings page
  Menu: 'Menu',
  'Changes apply to new orders. Orders already placed keep their colors.':
    'Wijzigingen gelden voor nieuwe bestellingen. Bestellingen die al geplaatst zijn, houden hun kleuren.',
  'Sold so far:': 'Tot nu toe verkocht:',
  'still available:': 'nog beschikbaar:',
  'Used right now: prepare {prepare} min per pizza, bake {bake} min, counter {counter} min, with room for {slots} pizza in the oven at once.':
    'Nu gebruikt: beleggen {prepare} min per pizza, bakken {bake} min, balie {counter} min, met plaats voor {slots} pizza tegelijk in de oven.',
  'Used right now: prepare {prepare} min per pizza, bake {bake} min, counter {counter} min, with room for {slots} pizzas in the oven at once.':
    "Nu gebruikt: beleggen {prepare} min per pizza, bakken {bake} min, balie {counter} min, met plaats voor {slots} pizza's tegelijk in de oven.",
  'Save settings': 'Instellingen opslaan',
  'Saved.': 'Opgeslagen.',
  // Menu editor
  'Price of this pizza (empty: the general price)': 'Prijs van deze pizza (leeg: de algemene prijs)',
  'Price {name}': 'Prijs {name}',
  Max: 'Max',
  'How many of this pizza can be made (empty: no limit)':
    'Hoeveel van deze pizza je kunt maken (leeg: geen limiet)',
  'Maximum {name}': 'Maximum {name}',
  'Color for {name}': 'Kleur voor {name}',
  'Add a pizza…': 'Pizza toevoegen…',
  'Color for the new pizza': 'Kleur voor de nieuwe pizza',
  Add: 'Toevoegen',
  '€: a price for this pizza (empty: the general price below). Max: how many of a pizza the ingredients allow (empty: no limit).':
    '€: een prijs voor deze pizza (leeg: de algemene prijs hieronder). Max: hoeveel van een pizza de ingrediënten toelaten (leeg: geen limiet).',
  'That pizza is already on the list.': 'Die pizza staat al op de lijst.',
  'First order number': 'Eerste bestelnummer',
  'Options per pizza': 'Opties per pizza',
  'Quick picks for the note of each pizza when taking orders. Remove them all to keep only the free text note.':
    'Snelle keuzes voor de opmerking bij elke pizza tijdens het bestellen. Verwijder ze allemaal om enkel het vrije tekstveld te houden.',
  'No options: only the free text note per pizza.': 'Geen opties: enkel het vrije tekstveld per pizza.',
  'New option, e.g. Extra cheese': 'Nieuwe optie, bv. Extra kaas',
  'New option': 'Nieuwe optie',
  '+ Add option': '+ Optie toevoegen',
  'Remove option {name}': 'Optie {name} verwijderen',
  'The number on your first printed ticket. You can change it later when taking orders.':
    'Het nummer op je eerste geprinte briefje. Je kan het later nog aanpassen bij het bestellen.',
  'The first order number must be a whole number from 1 to 999999.':
    'Het eerste bestelnummer moet een geheel getal van 1 tot 999999 zijn.',
  // Timing editor ('Counter' is in common)
  'Pizzas available in total': "Pizza's beschikbaar in totaal",
  '(how many you can make; 0 = no limit)': '(hoeveel je kunt maken; 0 = geen limiet)',
  'Price per pizza in €': 'Prijs per pizza in €',
  "(0 = don't show prices; set other prices per pizza above)":
    '(0 = geen prijzen tonen; stel hierboven andere prijzen per pizza in)',
  'Price per pizza': 'Prijs per pizza',
  Prepare: 'Beleggen',
  Bake: 'Bakken',
  'per pizza in the kitchen': 'per pizza in de keuken',
  'in the oven': 'in de oven',
  'to call the order once baked': 'om de bestelling af te roepen na het bakken',
  '{phase} minutes': '{phase} minuten',
  '{phase} seconds': '{phase} seconden',
  min: 'min',
  sec: 'sec',
  Ovens: 'Ovens',
  'baking at the same time': 'die tegelijk bakken',
  'Pizzas per oven': "Pizza's per oven",
  'at once': 'tegelijk',
  'The ovens limit how many pizzas bake at once. The times are starting estimates. As pizzas get prepared, baked and called, each phase follows the real times.':
    "De ovens bepalen hoeveel pizza's tegelijk bakken. De tijden zijn startschattingen. Naarmate pizza's belegd, gebakken en afgeroepen worden, volgt elke fase de echte tijden.",
  // Sponsors (Settings and the customer screens)
  Sponsors: 'Sponsors',
  'The customer screens show these one after another, with an optional message. Leave the list empty to show none.':
    'De klantenschermen tonen deze om beurten, met een optionele boodschap. Laat de lijst leeg om er geen te tonen.',
  'Sponsor name': 'Naam van de sponsor',
  Message: 'Boodschap',
  'Remove sponsor {n}': 'Sponsor {n} verwijderen',
  '+ Add sponsor': '+ Sponsor toevoegen',
  'Show each sponsor for (seconds)': 'Elke sponsor tonen gedurende (seconden)',
  'With thanks to': 'Met dank aan',
};
