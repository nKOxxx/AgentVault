ICON CREATION NEEDED

To create proper AgentVault icons:

1. Render build/icon.svg to PNG at 1024x1024 -> icon.png
2. Convert to .icns for macOS:
   - Create iconset with sizes: 16, 32, 64, 128, 256, 512, 1024
   - Use iconutil to convert to .icns
   
3. Or use electron-icon-builder:
   npm install -g electron-icon-builder
   electron-icon-builder --input=./build/icon.png --output=./build

For now, the app will use Electron's default icon.
