# node-systray

> SysTray2 library for nodejs using [systray-portable](https://github.com/felixhao28/systray-portable) (a portable version of [the go systray library](https://github.com/getlantern/systray)).


## Install
```sh
npm i systray2
# or
yarn add systray2
```

## Usage

```ts
import SysTray from 'systray2';
import os from 'os'

const item1 = {
  title: 'aa',
  tooltip: 'bb',
  // checked is implemented by plain text in linux
  checked: false,
  enabled: true,
  // click is not a standard property but a custom value
  click: () => {
    item1.checked = !item1.checked
    systray.sendAction({
      type: 'update-item',
      item: item1,
    })
    // toggle Exit
    itemExit.hidden = !itemExit.hidden
    systray.sendAction({
      type: 'update-item',
      item: itemExit,
    })
  }
}
const item2 = {
  title: 'aa2',
  tooltip: 'bb',
  checked: false,
  enabled: true,
  hidden: false,
  // add a submenu item
  items: [{
    title: 'Submenu',
    tooltip: 'this is a submenu item',
    checked: false,
    enabled: true,
    click: () => {
      // open the url
      console.log('open the url')
    }
  }]
}
const itemExit = {
  title: 'Exit',
  tooltip: 'bb',
  checked: false,
  enabled: true,
  click: () => {
    systray.kill(false)
  }
}
const systray = new SysTray({
  menu: {
    // you should use .png icon on macOS/Linux, and .ico format on Windows
    icon: os.platform() === 'win32' ? './logo_s.ico' : './logo_s.png',
    // a template icon is a transparency mask that will appear to be dark in light mode and light in dark mode
    isTemplateIcon: os.platform() === 'darwin',
    title: '标题',
    tooltip: 'Tips',
    items: [
      item1,
      SysTray.separator, // SysTray.separator is equivalent to a MenuItem with "title" equals "<SEPARATOR>"
      item2,
      itemExit
    ]
  },
  debug: false,
  copyDir: false // copy go tray binary to an outside directory, useful for packing tool like pkg.
})

systray.onClick(action => {
  if (action.item.click != null) {
    action.item.click()
  }
})

// Systray.ready is a promise which resolves when the tray is ready.
systray.ready().then(() => {
  console.log('systray started!')
}).catch(err => {
  console.log('systray failed to start: ' + err.message)
})

```

To integrate with packing tools like `webpack`, use something like `copy-webpack-plugin` to copy the desired `tray_*_release[.exe]` to the `traybin/` folder of the working directory.

## Known Issues

Toggling `hiding` on a menu item with a sub-menu causes the sub-menu to disappear.

## License
MIT
