import Cocoa

// ── Constants ─────────────────────────────────────────────────────────────────

let kPort           = 3080
let kBase           = "http://localhost:\(kPort)"
let kLabel          = "com.galley.reader"
let kPlist          = "\(NSHomeDirectory())/Library/LaunchAgents/\(kLabel).plist"
let kMenubarLabel   = "\(kLabel).menubar"
let kMenubarPlist   = "\(NSHomeDirectory())/Library/LaunchAgents/\(kMenubarLabel).plist"
let kLogFile        = "\(NSHomeDirectory())/Library/Logs/galley.log"

// ── App delegate ──────────────────────────────────────────────────────────────

class AppDelegate: NSObject, NSApplicationDelegate {

    private var item: NSStatusItem!
    private var pollTimer: Timer?
    private var isRunning = false

    private let session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = 2
        return URLSession(configuration: c)
    }()

    func applicationDidFinishLaunching(_: Notification) {
        NSApp.setActivationPolicy(.accessory)
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        setIcon(running: false)
        buildMenu()
        poll()
        pollTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            self?.poll()
        }
    }

    // ── Icon ──────────────────────────────────────────────────────────────────

    private func setIcon(running: Bool) {
        guard let btn = item.button else { return }
        let name = running ? "book.closed.fill" : "book.closed"
        let img  = NSImage(systemSymbolName: name, accessibilityDescription: "Chapter Reader")
        img?.isTemplate = true
        btn.image = img
        btn.toolTip = running
            ? "Galley — running on :\(kPort)"
            : "Galley — stopped"
    }

    // ── Menu ──────────────────────────────────────────────────────────────────

    private func buildMenu() {
        let menu = NSMenu()
        add(menu, "Galley", tag: -1, enabled: false)
        menu.addItem(.separator())
        add(menu, "Open in Browser",  tag: 1,  sel: #selector(openBrowser), key: "o")
        menu.addItem(.separator())
        add(menu, "◌  checking…",     tag: 10, enabled: false)
        add(menu, "Start Service",    tag: 11, sel: #selector(startSvc))
        add(menu, "Stop Service",     tag: 12, sel: #selector(stopSvc))
        add(menu, "Restart Service",  tag: 13, sel: #selector(restartSvc))
        menu.addItem(.separator())
        add(menu, "View Log",         tag: 2,  sel: #selector(openLog))
        menu.addItem(.separator())
        add(menu, "Quit Galley",      tag: 0,  sel: #selector(quitGalley(_:)), key: "q")
        item.menu = menu
        syncMenu(running: false)
    }

    @discardableResult
    private func add(_ menu: NSMenu, _ title: String, tag: Int,
                     sel: Selector? = nil, key: String = "",
                     enabled: Bool = true) -> NSMenuItem {
        let mi = NSMenuItem(title: title, action: sel, keyEquivalent: key)
        mi.tag     = tag
        mi.target  = self
        mi.isEnabled = enabled
        menu.addItem(mi)
        return mi
    }

    private func syncMenu(running: Bool) {
        setIcon(running: running)
        guard let menu = item.menu else { return }
        if let s = menu.item(withTag: 10) {
            s.title = running ? "●  Running on :\(kPort)" : "○  Stopped"
        }
        menu.item(withTag: 11)?.isEnabled = !running
        menu.item(withTag: 12)?.isEnabled =  running
        menu.item(withTag: 13)?.isEnabled =  running
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    @objc private func openBrowser() {
        NSWorkspace.shared.open(URL(string: kBase)!)
    }

    @objc private func startSvc() {
        // Try modern bootstrap first, fall back to legacy load
        sh("launchctl bootstrap gui/\(getuid()) '\(kPlist)' 2>/dev/null" +
           " || launchctl load '\(kPlist)' 2>/dev/null; true")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { self.poll() }
    }

    @objc private func stopSvc() {
        sh("launchctl bootout gui/\(getuid())/\(kLabel) 2>/dev/null" +
           " || launchctl unload '\(kPlist)' 2>/dev/null; true")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { self.poll() }
    }

    @objc private func restartSvc() {
        sh("launchctl kickstart -k gui/\(getuid())/\(kLabel) 2>/dev/null; true")
        // Build takes ~5s; poll after 10s to reflect the new running state
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { self.poll() }
    }

    @objc private func quitGalley(_ sender: Any?) {
        // Stop the book-server LaunchAgent first so it doesn't keep serving
        // requests after the menubar disappears. bootout deactivates the
        // agent for the remainder of this user session — login auto-start
        // is unaffected because the plist on disk is untouched.
        sh("launchctl bootout gui/\(getuid())/\(kLabel) 2>/dev/null" +
           " || launchctl unload '\(kPlist)' 2>/dev/null; true")
        // Stop this menubar's own LaunchAgent so it doesn't immediately
        // respawn us before NSApp.terminate completes. (KeepAlive is set to
        // { Crashed: true } so a clean exit wouldn't respawn anyway, but
        // bootout is the unambiguous "stay down" signal.)
        sh("launchctl bootout gui/\(getuid())/\(kMenubarLabel) 2>/dev/null" +
           " || launchctl unload '\(kMenubarPlist)' 2>/dev/null; true")
        NSApp.terminate(sender)
    }

    @objc private func openLog() {
        let url = URL(fileURLWithPath: kLogFile)
        if FileManager.default.fileExists(atPath: kLogFile) {
            NSWorkspace.shared.open(url)
        } else {
            let alert = NSAlert()
            alert.messageText = "No log file yet"
            alert.informativeText = "The server hasn't written any output to \(kLogFile) yet."
            alert.runModal()
        }
    }

    // ── Polling ───────────────────────────────────────────────────────────────

    private func poll() {
        guard let url = URL(string: "\(kBase)/api/chapters") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "HEAD"
        session.dataTask(with: req) { [weak self] _, resp, _ in
            DispatchQueue.main.async {
                let running = (resp as? HTTPURLResponse)?.statusCode == 200
                guard running != self?.isRunning else { return }
                self?.isRunning = running
                self?.syncMenu(running: running)
            }
        }.resume()
    }

    // ── Shell ─────────────────────────────────────────────────────────────────

    @discardableResult
    private func sh(_ cmd: String) -> String {
        let p = Process(); let pipe = Pipe()
        p.launchPath = "/bin/bash"
        p.arguments  = ["-c", cmd]
        p.standardOutput = pipe; p.standardError = pipe
        try? p.run(); p.waitUntilExit()
        return String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    }
}

// ── Entry point ───────────────────────────────────────────────────────────────

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
