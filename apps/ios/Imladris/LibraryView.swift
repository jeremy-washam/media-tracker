import SwiftUI

struct LibraryView: View {
    @State private var books: [FixtureBook] = []
    @State private var collection = FixtureBook.Collection.archive
    @State private var query = ""
    @State private var selectedBook: FixtureBook?
    @State private var loadFailed = false

    private var visibleBooks: [FixtureBook] {
        FixtureLibrary.filter(books, collection: collection, query: query)
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Sample library · Development setup")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("library.fixtureNotice")

                    Picker("Collection", selection: $collection) {
                        ForEach(FixtureBook.Collection.allCases, id: \.self) { value in
                            Text(value.title).tag(value)
                        }
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("library.collection")
                }

                Section("Books") {
                    if loadFailed {
                        ContentUnavailableView {
                            Label("Sample library unavailable", systemImage: "exclamationmark.triangle")
                        } description: {
                            Text("The bundled setup fixture could not be loaded.")
                        } actions: {
                            Button("Retry", action: loadBooks)
                        }
                    } else if visibleBooks.isEmpty {
                        ContentUnavailableView.search(text: query)
                    } else {
                        ForEach(visibleBooks) { book in
                            Button {
                                selectedBook = book
                            } label: {
                                HStack(spacing: 14) {
                                    Image(systemName: "book.closed")
                                        .font(.title2)
                                        .foregroundStyle(.secondary)
                                        .accessibilityHidden(true)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(book.title).foregroundStyle(.primary)
                                        Text(book.author)
                                            .font(.subheadline)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                .padding(.vertical, 4)
                            }
                            .accessibilityIdentifier("book.\(book.id)")
                        }
                    }
                }
            }
            .navigationTitle("Library")
            .searchable(text: $query, prompt: "Search sample books")
            .sheet(item: $selectedBook) { book in
                BookSheet(book: book)
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
            .task { loadBooks() }
        }
    }

    private func loadBooks() {
        do {
            books = try FixtureLibrary.load()
            loadFailed = false
        } catch {
            loadFailed = true
        }
    }
}

private struct BookSheet: View {
    let book: FixtureBook
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(book.title).font(.title2).fontWeight(.semibold)
                    Text(book.author).foregroundStyle(.secondary)
                    Text("Illustrative content for testing the native development workflow.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("History") {
                    if book.reads.isEmpty {
                        Text("No sample reads")
                    } else {
                        ForEach(book.reads) { read in
                            Label(read.dateLabel, systemImage: "book")
                                .accessibilityIdentifier("read.\(read.id)")
                        }
                    }
                }
            }
            .navigationTitle("Book")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Close") { dismiss() }
                        .accessibilityIdentifier("book.close")
                }
            }
        }
    }
}

#Preview {
    LibraryView()
}
