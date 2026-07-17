const Model = require('./Model');

class Category extends Model {
  static tableName = 'categories';

  static columns = {
    id:         'TEXT PRIMARY KEY',
    book_id:    'TEXT NOT NULL REFERENCES cashbooks(id) ON DELETE CASCADE',
    name:       'TEXT NOT NULL',
    created_at: 'TEXT DEFAULT (CURRENT_TIMESTAMP)',
  };

  static get indexes() {
    return [
      'CREATE INDEX IF NOT EXISTS idx_categories_book ON categories(book_id)',
    ];
  }

  static async findByBook(bookId) {
    return Category.findAll({ book_id: bookId }, { orderBy: 'created_at ASC' });
  }
}

module.exports = Category;
