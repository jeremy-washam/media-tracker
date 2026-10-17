import Foundation
import Testing
@testable import Imladris

struct FixtureLibraryTests {
    @Test func preservesUnknownDatesAndRepeatReads() throws {
        let books = try FixtureLibrary.load()
        let atlas = try #require(books.first { $0.id == "atlas" })
        #expect(atlas.collections.contains(.archive))
        #expect(atlas.collections.contains(.queue))
        #expect(atlas.reads.count == 2)
        #expect(atlas.reads[0].date == "2024")
        #expect(atlas.reads[0].precision == .year)

        let river = try #require(books.first { $0.id == "river" })
        #expect(river.reads[0].date == nil)
        #expect(river.reads[0].precision == .unknown)
        #expect(river.reads[0].dateLabel == "Date unavailable")
    }

    @Test func searchRespectsCollectionAndDoesNotChangeHistory() throws {
        let books = try FixtureLibrary.load()
        let results = FixtureLibrary.filter(books, collection: .queue, query: "  mira  ")
        #expect(results.map(\.id) == ["atlas"])
        #expect(results[0].reads.count == 2)
        #expect(FixtureLibrary.filter(books, collection: .archive, query: "garden").isEmpty)
    }
}
