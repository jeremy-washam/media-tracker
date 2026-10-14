import XCTest

@MainActor
final class SetupFlowTests: XCTestCase {
    func testBrowseHistoryAndReturn() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.staticTexts["library.fixtureNotice"].waitForExistence(timeout: 10))
        let book = app.buttons["book.atlas"]
        XCTAssertTrue(book.waitForExistence(timeout: 5))
        book.tap()

        XCTAssertTrue(app.buttons["book.close"].waitForExistence(timeout: 5))
        let history = app.staticTexts["History"]
        if !history.isHittable { app.swipeUp() }
        XCTAssertTrue(history.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["2024"].exists)
        XCTAssertTrue(app.staticTexts["2026-09-12"].exists)

        let sheet = XCTAttachment(screenshot: app.screenshot())
        sheet.name = "Book sheet and repeat-read history"
        sheet.lifetime = .keepAlways
        add(sheet)

        app.buttons["book.close"].tap()
        XCTAssertTrue(book.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["book.close"].exists)

        let library = XCTAttachment(screenshot: app.screenshot())
        library.name = "Library after dismissing the sheet"
        library.lifetime = .keepAlways
        add(library)
    }
}
