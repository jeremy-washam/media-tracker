import Foundation

// Synthetic setup data, not transport models for the production API.
struct FixtureBook: Codable, Identifiable, Sendable {
    enum Collection: String, Codable, CaseIterable, Sendable {
        case archive, queue

        var title: String { self == .archive ? "Archive" : "Queue" }
    }

    let id: String
    let title: String
    let author: String
    let collections: [Collection]
    let reads: [Read]

    struct Read: Codable, Identifiable, Sendable {
        enum Precision: String, Codable, Sendable {
            case day, month, year, unknown
        }

        let id: String
        let date: String?
        let precision: Precision

        var dateLabel: String { date ?? "Date unavailable" }
    }
}

enum FixtureLibrary {
    static func load(bundle: Bundle = .main) throws -> [FixtureBook] {
        guard let url = bundle.url(forResource: "books", withExtension: "json") else {
            throw CocoaError(.fileNoSuchFile)
        }
        return try JSONDecoder().decode([FixtureBook].self, from: Data(contentsOf: url))
    }

    static func filter(
        _ books: [FixtureBook], collection: FixtureBook.Collection, query: String
    ) -> [FixtureBook] {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return books.filter { book in
            book.collections.contains(collection)
                && (text.isEmpty || book.title.localizedStandardContains(text)
                    || book.author.localizedStandardContains(text))
        }
    }
}
