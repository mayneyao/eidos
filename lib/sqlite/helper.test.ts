import { buildSql } from './helper'

describe('buildSQl', () => {
  test('buildSQl with table name', () => {
    expect(buildSql`select * from ${Symbol('books')}`).toStrictEqual({
      sql: 'select * from books',
      bind: []
    });
  });

  test('buildSQl with table name and id', () => {
    expect(buildSql`select * from ${Symbol('books')} where id = ${42}`).toStrictEqual({
      sql: 'select * from books where id = ?',
      bind: [42]
    });
  });

  test('buildSQl with table name and number/string var', () => {
    expect(buildSql`select * from ${Symbol('books')} where id = ${42} and name = ${'hello'}`).toStrictEqual({
      sql: 'select * from books where id = ? and name = ?',
      bind: [42, 'hello']
    });
  });

  test('buildSQl with field name, table name and number/string var', () => {
    const fieldName = Symbol('id')
    expect(buildSql`select ${fieldName},${Symbol('name')} from ${Symbol('books')} where id = ${42} and name = ${'hello'} and id = ${42}`).toStrictEqual({
      sql: 'select id,name from books where id = ? and name = ? and id = ?',
      bind: [42, 'hello', 42]
    });
  })

  test('buildSQl with pure string', () => {
    expect(buildSql`SELECT name FROM sqlite_master WHERE type='table'`).toStrictEqual({
      sql: `SELECT name FROM sqlite_master WHERE type='table'`,
      bind: []
    });
  })

  test('buildSQl with only var', () => {
    expect(buildSql`${'select * from books'}`).toStrictEqual({
      sql: 'select * from books',
      bind: []
    });
  })

  test('buildSQl with array var', () => {
    expect(buildSql`select * from books where id in ${[1, 2, 3]}`).toStrictEqual({
      sql: 'select * from books where id in (?,?,?)',
      bind: [1, 2, 3]
    });
  })
})
