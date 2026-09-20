UPDATE book_library_projection AS p
SET latest_read_format = (
      SELECT CASE e.reading_format_id
        WHEN 1 THEN 'Physical'
        WHEN 2 THEN 'Audiobook'
        WHEN 4 THEN 'Ebook'
        ELSE CASE lower(trim(e.reading_format))
          WHEN 'physical book' THEN 'Physical'
          WHEN 'physical' THEN 'Physical'
          WHEN 'audio book' THEN 'Audiobook'
          WHEN 'audiobook' THEN 'Audiobook'
          WHEN 'ebook' THEN 'Ebook'
          WHEN 'e-book' THEN 'Ebook'
        END
      END
      FROM hardcover_user_book_reads r
      LEFT JOIN hardcover_book_editions e
        ON e.connection_id = r.connection_id AND e.edition_id = r.edition_id
      WHERE r.connection_id = p.connection_id AND r.read_id = p.latest_read_id
      LIMIT 1
    ),
    current_edition_format = (
      SELECT CASE e.reading_format_id
        WHEN 1 THEN 'Physical'
        WHEN 2 THEN 'Audiobook'
        WHEN 4 THEN 'Ebook'
        ELSE CASE lower(trim(e.reading_format))
          WHEN 'physical book' THEN 'Physical'
          WHEN 'physical' THEN 'Physical'
          WHEN 'audio book' THEN 'Audiobook'
          WHEN 'audiobook' THEN 'Audiobook'
          WHEN 'ebook' THEN 'Ebook'
          WHEN 'e-book' THEN 'Ebook'
        END
      END
      FROM hardcover_user_books ub
      LEFT JOIN hardcover_book_editions e
        ON e.connection_id = ub.connection_id AND e.edition_id = ub.current_edition_id
      WHERE ub.connection_id = p.connection_id AND ub.user_book_id = p.user_book_id
      LIMIT 1
    ),
    projection_version = 2;
