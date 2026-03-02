const mustGet = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
};

export const getDom = () => {
  const root = mustGet("root");
  const fileBar = document.getElementById("fileBar");
  const fileNameInput = document.getElementById("fileNameInput");
  const modeBar = document.getElementById("modeBar");
  const menuContainer = mustGet("menuContainer");
  const burgerButton = mustGet("burger");
  const burgerMenu = mustGet("burgerMenu");

  const groups = {
    scripts: {
      group: burgerMenu.querySelector('.menuGroup[data-group="scripts"]'),
      toggle: burgerMenu.querySelector(
        '.menuGroup[data-group="scripts"] button[data-toggle]',
      ),
      submenu: document.getElementById("menu-scripts"),
    },
    stylesheets: {
      group: burgerMenu.querySelector('.menuGroup[data-group="stylesheets"]'),
      toggle: burgerMenu.querySelector(
        '.menuGroup[data-group="stylesheets"] button[data-toggle]',
      ),
      submenu: document.getElementById("menu-stylesheets"),
    },
    images: {
      group: burgerMenu.querySelector('.menuGroup[data-group="images"]'),
      toggle: burgerMenu.querySelector(
        '.menuGroup[data-group="images"] button[data-toggle]',
      ),
      submenu: document.getElementById("menu-images"),
    },
    extras: {
      group: burgerMenu.querySelector('.menuGroup[data-group="extras"]'),
      toggle: burgerMenu.querySelector(
        '.menuGroup[data-group="extras"] button[data-toggle]',
      ),
      submenu: document.getElementById("menu-extras"),
    },
  };

  return {
    root,
    fileBar,
    fileNameInput,
    modeBar,
    menuContainer,
    burgerButton,
    burgerMenu,
    groups,
  };
};
