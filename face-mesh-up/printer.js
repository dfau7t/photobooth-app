// =============================================================
// printer.js — send the finished collage to a physical printer.
//
// How it works:
//   Browsers cannot print silently on their own, so this file sends
//   the collage PNG to our tiny local script `server.py` (POST /print),
//   which saves a copy in `prints/` and passes it to macOS `lp`.
//
// Functions used by sketch.js:
//   checkPrintServer()  check on startup if server.py + a printer are ready
//   printCollage()      send the current `collage` canvas to the printer
//   printStatusText()   short text for the debug / settings panels
// =============================================================

let printInFlight = false;
let printerState = {
  checked: false,
  serverRunning: false,
  hasPrinter: false,
  defaultPrinter: '',
  lastMessage: '',
};

// Ask server.py whether macOS has a printer ready. Runs once at startup.
async function checkPrintServer() {
  try {
    const res = await fetch('/print/status', { cache: 'no-store' });
    if (!res.ok) {
      printerState = { checked: true, serverRunning: false, hasPrinter: false, defaultPrinter: '', lastMessage: '' };
      return;
    }
    const data = await res.json();
    printerState = {
      checked: true,
      serverRunning: true,
      hasPrinter: Boolean(data.hasPrinter),
      defaultPrinter: data.defaultPrinter || (data.printers && data.printers[0]) || '',
      lastMessage: '',
    };
    console.log('[printer] Status:', data);
  } catch (err) {
    printerState = { checked: true, serverRunning: false, hasPrinter: false, defaultPrinter: '', lastMessage: '' };
  }
}

// Short label shown in the debug panel (D key)
function printStatusText() {
  if (!printerState.checked) return 'checking…';
  if (!printerState.serverRunning) return 'server.py off';
  if (!printerState.hasPrinter) return 'no printer in macOS';
  return 'ready (' + (printerState.defaultPrinter || 'default') + ')';
}

// Build a clean filename like facemeshup_20261112_124500_0042.png
function makePrintFilename() {
  const stamp = year() + nf(month(), 2) + nf(day(), 2) + '_' + nf(hour(), 2) + nf(minute(), 2) + nf(second(), 2);
  const meshTag = recipe && recipe.number ? '_' + nf(recipe.number, 4) : '';
  return 'facemeshup_' + stamp + meshTag + '.png';
}

// Send the finished 1600x2000 collage to server.py -> macOS lp
async function printCollage() {
  if (!collage) return;
  if (printInFlight) {
    showMessage('Already sending to printer…');
    return;
  }

  const canvasEl = collage.elt || collage.canvas;
  if (!canvasEl) {
    showMessage('Could not read collage canvas');
    return;
  }

  printInFlight = true;
  showMessage('Sending to printer…');

  try {
    const cfg = CONFIG.printer;
    const pngDataUrl = canvasEl.toDataURL('image/png');

    const res = await fetch('/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: pngDataUrl,
        filename: makePrintFilename(),
        printer: cfg.name,
        media: cfg.media,
        mediaType: cfg.mediaType,
        duplex: cfg.duplex,
        quality: cfg.quality,
        colorMode: cfg.colorMode,
        fitToPage: cfg.fitToPage,
        saveCopy: cfg.saveCopy,
      }),
    });

    // If someone started `python3 -m http.server` instead of `python3 server.py`,
    // http.server replies with 501 (Unsupported method) or 404.
    if (res.status === 404 || res.status === 405 || res.status === 501) {
      showMessage('Start with python3 server.py to print');
      console.warn('[printer] Static server cannot print (HTTP ' + res.status + '). Run: python3 server.py');
      return;
    }

    const data = await res.json();
    if (res.ok && data.ok) {
      console.log('[printer] Printed:', data);
      showMessage('Sent to printer!');
    } else {
      console.warn('[printer] Print failed:', data);
      if (data.savedTo) {
        showMessage('No printer ready — saved in ' + data.savedTo);
      } else {
        showMessage('Print error: ' + (data.error || 'unknown'));
      }
    }
  } catch (err) {
    console.warn('[printer] Request failed:', err);
    showMessage('Start with python3 server.py to print');
  } finally {
    printInFlight = false;
  }
}
