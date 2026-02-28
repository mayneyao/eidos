import {
  SqlQueryBuilder,
  type FindManyOptions,
  type WhereCondition,
} from "./sql-query-builder"

describe("SqlQueryBuilder", () => {
  const tableName = "users"

  describe("buildFindMany", () => {
    test("should build basic query without options", () => {
      const result = SqlQueryBuilder.buildFindMany(tableName)

      expect(result.sql).toBe("SELECT * FROM users;")
      expect(result.countSql).toBe("SELECT COUNT(*) as count FROM users;")
      expect(result.params).toEqual([])
      expect(result.countParams).toEqual([])
    })

    test("should build query with simple where condition", () => {
      const options: FindManyOptions = {
        where: { name: "John" },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe("SELECT * FROM users WHERE name = ?;")
      expect(result.countSql).toBe(
        "SELECT COUNT(*) as count FROM users WHERE name = ?;"
      )
      expect(result.params).toEqual(["John"])
      expect(result.countParams).toEqual(["John"])
    })

    test("should build query with null condition", () => {
      const options: FindManyOptions = {
        where: { email: null },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe("SELECT * FROM users WHERE email IS NULL;")
      expect(result.countSql).toBe(
        "SELECT COUNT(*) as count FROM users WHERE email IS NULL;"
      )
      expect(result.params).toEqual([])
      expect(result.countParams).toEqual([])
    })

    test("should build query with undefined condition", () => {
      const options: FindManyOptions = {
        where: { email: undefined },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe("SELECT * FROM users WHERE email IS NULL;")
      expect(result.countSql).toBe(
        "SELECT COUNT(*) as count FROM users WHERE email IS NULL;"
      )
      expect(result.params).toEqual([])
      expect(result.countParams).toEqual([])
    })

    test("should build query with multiple where conditions", () => {
      const options: FindManyOptions = {
        where: {
          name: "John",
          age: 25,
          active: true,
        },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe(
        "SELECT * FROM users WHERE name = ? AND age = ? AND active = ?;"
      )
      expect(result.countSql).toBe(
        "SELECT COUNT(*) as count FROM users WHERE name = ? AND age = ? AND active = ?;"
      )
      expect(result.params).toEqual(["John", 25, true])
      expect(result.countParams).toEqual(["John", 25, true])
    })

    test("should build query with AND logical operator", () => {
      const options: FindManyOptions = {
        where: {
          AND: [{ name: "John" }, { age: { gte: 18 } }],
        },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe(
        "SELECT * FROM users WHERE (name = ?) AND (age >= ?);"
      )
      expect(result.countSql).toBe(
        "SELECT COUNT(*) as count FROM users WHERE (name = ?) AND (age >= ?);"
      )
      expect(result.params).toEqual(["John", 18])
      expect(result.countParams).toEqual(["John", 18])
    })

    test("should build query with OR logical operator", () => {
      const options: FindManyOptions = {
        where: {
          OR: [{ name: "John" }, { name: "Jane" }],
        },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe(
        "SELECT * FROM users WHERE (name = ?) OR (name = ?);"
      )
      expect(result.countSql).toBe(
        "SELECT COUNT(*) as count FROM users WHERE (name = ?) OR (name = ?);"
      )
      expect(result.params).toEqual(["John", "Jane"])
      expect(result.countParams).toEqual(["John", "Jane"])
    })

    test("should build query with NOT logical operator", () => {
      const options: FindManyOptions = {
        where: {
          NOT: { name: "John" },
        },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe("SELECT * FROM users WHERE NOT (name = ?);")
      expect(result.countSql).toBe(
        "SELECT COUNT(*) as count FROM users WHERE NOT (name = ?);"
      )
      expect(result.params).toEqual(["John"])
      expect(result.countParams).toEqual(["John"])
    })

    test("should build query with complex logical operators", () => {
      const options: FindManyOptions = {
        where: {
          AND: [
            { age: { gte: 18 } },
            {
              OR: [{ role: "admin" }, { role: "moderator" }],
            },
          ],
        },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe(
        "SELECT * FROM users WHERE (age >= ?) AND ((role = ?) OR (role = ?));"
      )
      expect(result.countSql).toBe(
        "SELECT COUNT(*) as count FROM users WHERE (age >= ?) AND ((role = ?) OR (role = ?));"
      )
      expect(result.params).toEqual([18, "admin", "moderator"])
      expect(result.countParams).toEqual([18, "admin", "moderator"])
    })

    test("should build query with orderBy single field", () => {
      const options: FindManyOptions = {
        orderBy: { name: "asc" },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe("SELECT * FROM users ORDER BY name ASC;")
      expect(result.countSql).toBe("SELECT COUNT(*) as count FROM users;")
      expect(result.params).toEqual([])
      expect(result.countParams).toEqual([])
    })

    test("should build query with orderBy multiple fields", () => {
      const options: FindManyOptions = {
        orderBy: [{ name: "asc" }, { age: "desc" }],
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe(
        "SELECT * FROM users ORDER BY name ASC, age DESC;"
      )
      expect(result.countSql).toBe("SELECT COUNT(*) as count FROM users;")
      expect(result.params).toEqual([])
      expect(result.countParams).toEqual([])
    })

    test("should build query with skip and take", () => {
      const options: FindManyOptions = {
        skip: 10,
        take: 20,
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe("SELECT * FROM users LIMIT 20 OFFSET 10;")
      expect(result.countSql).toBe("SELECT COUNT(*) as count FROM users;")
      expect(result.params).toEqual([])
      expect(result.countParams).toEqual([])
    })

    test("should build query with only skip", () => {
      const options: FindManyOptions = {
        skip: 10,
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe("SELECT * FROM users OFFSET 10;")
      expect(result.countSql).toBe("SELECT COUNT(*) as count FROM users;")
      expect(result.params).toEqual([])
      expect(result.countParams).toEqual([])
    })

    test("should build query with only take", () => {
      const options: FindManyOptions = {
        take: 20,
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe("SELECT * FROM users LIMIT 20;")
      expect(result.countSql).toBe("SELECT COUNT(*) as count FROM users;")
      expect(result.params).toEqual([])
      expect(result.countParams).toEqual([])
    })

    test("should build query with select fields", () => {
      const options: FindManyOptions = {
        select: {
          id: true,
          name: true,
          email: false,
        },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe("SELECT id, name FROM users;")
      expect(result.countSql).toBe("SELECT COUNT(*) as count FROM users;")
      expect(result.params).toEqual([])
      expect(result.countParams).toEqual([])
    })

    test("should build query with all options combined", () => {
      const options: FindManyOptions = {
        where: {
          age: { gte: 18 },
          active: true,
        },
        orderBy: { name: "asc" },
        skip: 10,
        take: 20,
        select: { id: true, name: true },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe(
        "SELECT id, name FROM users WHERE age >= ? AND active = ? ORDER BY name ASC LIMIT 20 OFFSET 10;"
      )
      expect(result.countSql).toBe(
        "SELECT COUNT(*) as count FROM users WHERE age >= ? AND active = ?;"
      )
      expect(result.params).toEqual([18, true])
      expect(result.countParams).toEqual([18, true])
    })
  })

  describe("object conditions", () => {
    test("should handle equals operator", () => {
      const options: FindManyOptions = {
        where: { name: { equals: "John" } },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe("SELECT * FROM users WHERE name = ?;")
      expect(result.params).toEqual(["John"])
    })

    test("should handle not operator", () => {
      const options: FindManyOptions = {
        where: { name: { not: "John" } },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe("SELECT * FROM users WHERE name != ?;")
      expect(result.params).toEqual(["John"])
    })

    test("should handle in operator", () => {
      const options: FindManyOptions = {
        where: { role: { in: ["admin", "user"] } },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe("SELECT * FROM users WHERE role IN (?, ?);")
      expect(result.params).toEqual(["admin", "user"])
    })

    test("should handle notIn operator", () => {
      const options: FindManyOptions = {
        where: { role: { notIn: ["admin", "user"] } },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe("SELECT * FROM users WHERE role NOT IN (?, ?);")
      expect(result.params).toEqual(["admin", "user"])
    })

    test("should handle comparison operators", () => {
      const options: FindManyOptions = {
        where: {
          age: { gt: 18, lt: 65 },
          score: { gte: 80, lte: 100 },
        },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe(
        "SELECT * FROM users WHERE age > ? AND age < ? AND score >= ? AND score <= ?;"
      )
      expect(result.params).toEqual([18, 65, 80, 100])
    })

    test("should handle string operators", () => {
      const options: FindManyOptions = {
        where: {
          name: { contains: "John" },
          email: { startsWith: "john@" },
          domain: { endsWith: ".com" },
        },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe(
        "SELECT * FROM users WHERE name LIKE ? AND email LIKE ? AND domain LIKE ?;"
      )
      expect(result.params).toEqual(["%John%", "john@%", "%.com"])
    })

    test("should handle empty in array", () => {
      const options: FindManyOptions = {
        where: { role: { in: [] } },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe("SELECT * FROM users;")
      expect(result.params).toEqual([])
    })

    test("should handle empty notIn array", () => {
      const options: FindManyOptions = {
        where: { role: { notIn: [] } },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe("SELECT * FROM users;")
      expect(result.params).toEqual([])
    })
  })

  describe("edge cases", () => {
    test("should handle empty where object", () => {
      const options: FindManyOptions = {
        where: {},
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe("SELECT * FROM users;")
      expect(result.params).toEqual([])
    })

    test("should handle empty select object", () => {
      const options: FindManyOptions = {
        select: {},
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe("SELECT * FROM users;")
      expect(result.params).toEqual([])
    })

    test("should handle all false select fields", () => {
      const options: FindManyOptions = {
        select: {
          id: false,
          name: false,
        },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe("SELECT * FROM users;")
      expect(result.params).toEqual([])
    })

    test("should handle mixed boolean select fields", () => {
      const options: FindManyOptions = {
        select: {
          id: true,
          name: false,
          email: true,
        },
      }

      const result = SqlQueryBuilder.buildFindMany(tableName, options)

      expect(result.sql).toBe("SELECT id, email FROM users;")
      expect(result.params).toEqual([])
    })
  })
})
