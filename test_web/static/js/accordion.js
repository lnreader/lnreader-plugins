/** @ts-check */

class AccordionContent extends HTMLElement {
  constructor() {
    super();
    this.gridElement = document.createElement('div');
  }
  get content() {
    return this.gridElement;
  }
  connectedCallback() {
    // create a div that'll animate the collapsing
    this.gridElement.append(...Array.from(this.childNodes));
    this.gridElement.classList.add('accordion-animation-content');
    this.innerHTML = '';
    this.append(this.gridElement);
  }
}

class AccordionHeader extends HTMLElement {
  constructor() {
    super();
    console.log('contructor?');
    this.btn = document.createElement('button');
  }
  get html() {
    return this.btn.innerHTML;
  }
  set html(val) {
    this.btn.innerHTML = val;
  }
  get text() {
    return this.btn.innerText;
  }
  set text(val) {
    this.btn.innerText = val;
  }
  get parentBox() {
    return this.parentElement;
  }
  connectedCallback() {
    const childNodes = Array.from(this.childNodes);
    this.innerHTML = '';
    this.btn.append(...childNodes);
    this.append(this.btn);
    this.btn.addEventListener('click', this._btnClicked.bind(this));
  }
  _btnClicked() {
    this.parentBox?.toggle();
  }
}

class AccordionBox extends HTMLElement {
  constructor() {
    super();
  }
  get collapsed() {
    return this.hasAttribute('collapsed');
  }
  set collapsed(val) {
    if (val) {
      this.setAttribute('collapsed', '');
    } else {
      this.removeAttribute('collapsed');
    }
  }
  toggle() {
    this.collapsed = !this.collapsed;
  }
}

class Accordion extends HTMLElement {
  constructor() {
    super();
  }
}

window.customElements.define('main-accordion', Accordion);
window.customElements.define('accordion-box', AccordionBox);
window.customElements.define('accordion-header', AccordionHeader);
window.customElements.define('accordion-content', AccordionContent);

// Export types for use in index.js
const module = {};

module.exports = {
  AccordionBox,
  Accordion,
  AccordionContent,
  AccordionHeader,
};
