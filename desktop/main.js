const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// Keep references to prevent garbage collection
let mainWindow = null;
let tray = null;
let serverProcess = null;

// Get app data directory for storing vault
const userDataPath = app.getPath('userData');
process.env.AGENTVAULT_DATA_DIR = userDataPath;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 520,
    height: 700,
    minWidth: 400,
    minHeight: 500,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    show: false // Don't show until loaded
  });

  // Load the app
  mainWindow.loadURL('http://localhost:8765');

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Hide instead of close (keep in tray)
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Create tray icon (use emoji or generate from text)
  const trayIcon = nativeImage.createFromNamedImage('NSStatusItem', [16, 16]);
  
  tray = new Tray(trayIcon);
  tray.setToolTip('AgentVault');
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open AgentVault',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  
  // Click to toggle window
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    } else {
      createWindow();
    }
  });
}

function startServer() {
  // Start the Node.js server
  const serverPath = path.join(__dirname, 'server.js');
  
  serverProcess = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      AGENTVAULT_DATA_DIR: userDataPath
    },
    stdio: 'pipe'
  });

  serverProcess.stdout.on('data', (data) => {
    console.log('[Server]', data.toString().trim());
  });

  serverProcess.stderr.on('data', (data) => {
    console.error('[Server Error]', data.toString().trim());
  });

  serverProcess.on('exit', (code) => {
    console.log(`[Server] exited with code ${code}`);
  });
}

// App event handlers
app.whenReady().then(() => {
  startServer();
  
  // Wait for server to start
  setTimeout(() => {
    createWindow();
    createTray();
  }, 2000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit - keep running in tray
});

app.on('before-quit', () => {
  app.isQuiting = true;
  
  // Kill server process
  if (serverProcess) {
    serverProcess.kill();
  }
});

// IPC handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('show-window', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});
