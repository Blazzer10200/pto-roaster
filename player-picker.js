// Searchable single-select combobox. The hidden field stores IDs, never search text.
export function mountPlayerPicker(root, { options, value, onChange }) {
  const input = root.querySelector('[role="combobox"]');
  const hidden = root.querySelector('input[type="hidden"]');
  const toggle = root.querySelector('[data-picker-toggle]');
  const panel = root.querySelector('[data-picker-panel]');
  const list = root.querySelector('[role="listbox"]');
  const message = root.querySelector('[data-picker-message]');
  const players = [...options].sort((a, b) => a.name.localeCompare(b.name));
  let selected = players.find(p => p.id === value) || null;
  let matches = players;
  let active = -1;
  let open = false;

  function syncValue() {
    input.value = selected?.name || '';
    hidden.value = selected?.id || '';
    input.setCustomValidity(selected ? '' : 'Choose a player from the list.');
    root.classList.toggle('has-selection', Boolean(selected));
  }
  function highlight(index) {
    active = index;
    const rows = [...list.children];
    rows.forEach((row, i) => row.classList.toggle('is-active', i === active));
    if (rows[active]) {
      input.setAttribute('aria-activedescendant', rows[active].id);
      rows[active].scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }
  function renderOptions(query = '') {
    matches = players.filter(p => p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    list.replaceChildren();
    matches.forEach((player, index) => {
      const row = document.createElement('div');
      row.id = `${list.id}-${index}`;
      row.className = 'picker-option';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(player.id === selected?.id));
      const avatar = document.createElement('span');
      avatar.className = 'picker-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = player.name.trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase();
      const name = document.createElement('span');
      name.className = 'picker-name';
      name.textContent = player.name;
      const check = document.createElement('span');
      check.className = 'picker-check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = player.id === selected?.id ? '✓' : '';
      row.append(avatar, name, check);
      row.addEventListener('pointerdown', event => event.preventDefault());
      row.addEventListener('pointermove', () => highlight(index));
      row.addEventListener('click', () => choose(index));
      list.append(row);
    });
    message.hidden = matches.length > 0;
    message.textContent = players.length ? 'No players found. Try another name or add a player.' : 'No players yet. Use Add player to get started.';
    highlight(matches.length ? Math.max(0, matches.findIndex(p => p.id === selected?.id)) : -1);
  }
  function show(query = '') {
    open = true;
    panel.hidden = false;
    root.classList.add('is-open');
    input.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close player list');
    renderOptions(query);
  }
  function close() {
    open = false;
    panel.hidden = true;
    root.classList.remove('is-open');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    toggle.setAttribute('aria-label', 'Open player list');
    syncValue();
  }
  function choose(index) {
    if (!matches[index]) return;
    selected = matches[index];
    close();
    input.removeAttribute('aria-invalid');
    onChange(selected.id);
    input.focus();
  }
  input.addEventListener('click', () => { if (!open) { show(); input.select(); } });
  input.addEventListener('input', () => show(input.value));
  input.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { show(); if (event.key === 'ArrowUp') highlight(matches.length - 1); }
      else if (matches.length) highlight((active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') close();
    else if (open && (event.key === 'Home' || event.key === 'End') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      highlight(event.key === 'Home' ? 0 : matches.length - 1);
    }
  });
  toggle.addEventListener('pointerdown', event => event.preventDefault());
  toggle.addEventListener('click', () => { input.focus(); if (open) close(); else { show(); input.select(); } });
  root.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget)) close(); });
  input.addEventListener('invalid', () => { input.setAttribute('aria-invalid', 'true'); });
  // Page-level delegation avoids retaining listeners when the form is re-rendered.
  root.closePicker = close;
  syncValue();
}
