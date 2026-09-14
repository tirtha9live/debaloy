DELETE FROM categories WHERE is_builtin = 0 AND trim(name) = '';
