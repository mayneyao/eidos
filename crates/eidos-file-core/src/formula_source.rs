#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    QuotedIdent(String),
    Ident(String),
    Number(String),
    StringLit(String),
    Symbol(String),
}

pub fn tokenize(source: &str) -> std::result::Result<Vec<Token>, String> {
    let bytes = source.as_bytes();
    let mut i = 0;
    let mut out = Vec::new();
    while i < bytes.len() {
        let b = bytes[i];
        if b.is_ascii_whitespace() {
            i += 1;
            continue;
        }
        // Reject SQL comments in formulas
        if (b == b'-' && i + 1 < bytes.len() && bytes[i + 1] == b'-')
            || (b == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'*')
        {
            return Err("SQL comments are not allowed in formulas".into());
        }
        if b == b';' {
            return Err("Semicolons are not allowed in formulas".into());
        }
        if b == b'"' {
            i += 1;
            let mut ident = String::new();
            let mut closed = false;
            while i < bytes.len() {
                if bytes[i] == b'"' {
                    if i + 1 < bytes.len() && bytes[i + 1] == b'"' {
                        ident.push('"');
                        i += 2;
                    } else {
                        i += 1;
                        closed = true;
                        break;
                    }
                } else {
                    let ch = source[i..].chars().next().unwrap();
                    ident.push(ch);
                    i += ch.len_utf8();
                }
            }
            if !closed {
                return Err("Unterminated quoted field reference".into());
            }
            out.push(Token::QuotedIdent(ident));
            continue;
        }
        if b == b'\'' {
            let start = i;
            i += 1;
            let mut closed = false;
            while i < bytes.len() {
                if bytes[i] == b'\'' {
                    if i + 1 < bytes.len() && bytes[i + 1] == b'\'' {
                        i += 2;
                    } else {
                        i += 1;
                        closed = true;
                        break;
                    }
                } else {
                    let ch = source[i..].chars().next().unwrap();
                    i += ch.len_utf8();
                }
            }
            if !closed {
                return Err("Unterminated string literal".into());
            }
            out.push(Token::StringLit(source[start..i].to_string()));
            continue;
        }
        if b.is_ascii_digit() || (b == b'.' && i + 1 < bytes.len() && bytes[i + 1].is_ascii_digit())
        {
            let start = i;
            while i < bytes.len()
                && (bytes[i].is_ascii_digit() || matches!(bytes[i], b'.' | b'e' | b'E'))
            {
                if matches!(bytes[i], b'e' | b'E')
                    && i + 1 < bytes.len()
                    && matches!(bytes[i + 1], b'+' | b'-')
                {
                    i += 2;
                } else {
                    i += 1;
                }
            }
            out.push(Token::Number(source[start..i].to_string()));
            continue;
        }
        if b.is_ascii_alphabetic() || b == b'_' {
            let start = i;
            while i < bytes.len() && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_') {
                i += 1;
            }
            out.push(Token::Ident(source[start..i].to_string()));
            continue;
        }
        // Multi-char operators
        if let Some(pair) = source.get(i..i + 2)
            && matches!(pair, "<=" | ">=" | "!=" | "<>" | "==" | "||")
        {
            out.push(Token::Symbol(pair.to_string()));
            i += 2;
            continue;
        }
        if matches!(
            b,
            b'+' | b'-' | b'*' | b'/' | b'%' | b'(' | b')' | b',' | b'=' | b'<' | b'>'
        ) {
            out.push(Token::Symbol((b as char).to_string()));
            i += 1;
            continue;
        }
        return Err(format!("Unexpected character in formula at byte {i}"));
    }
    Ok(out)
}

use crate::error::{EidosError, Result};
use crate::naming::quote_identifier;

use crate::model::FormulaResultType as Kind;

type Type = Option<Kind>;

fn mismatch() -> EidosError {
    EidosError::InvalidSchema("Incompatible Formula operand or result type".into())
}

fn numeric(kind: Type) -> bool {
    matches!(kind, None | Some(Kind::Integer | Kind::Number))
}

fn require(kind: Type, expected: Kind) -> Result<()> {
    if kind.is_none() || kind == Some(expected) {
        Ok(())
    } else {
        Err(mismatch())
    }
}

fn common(kinds: impl Iterator<Item = Type>) -> Result<Type> {
    let mut result = None;
    for kind in kinds.flatten() {
        require(result, kind)?;
        result = Some(kind);
    }
    Ok(result)
}

fn binary_type(op: &str, a: Type, b: Type) -> Result<Type> {
    use Kind::*;
    match op {
        "AND" | "OR" => {
            require(a, Checkbox)?;
            require(b, Checkbox)?;
            Ok(Some(Checkbox))
        }
        "||" => Ok(Some(Text)),
        "+" | "-" | "*" | "/" | "%" => {
            if !numeric(a) || !numeric(b) {
                return Err(mismatch());
            }
            if op == "%" {
                require(a, Integer)?;
                require(b, Integer)?;
                return Ok(Some(Integer));
            }
            if op == "/" || a == Some(Number) || b == Some(Number) {
                Ok(Some(Number))
            } else {
                Ok(a.or(b))
            }
        }
        _ if a.is_none() && b.is_none() => Err(mismatch()),
        _ if a.is_none() || b.is_none() || a == b || (numeric(a) && numeric(b)) => {
            Ok(Some(Checkbox))
        }
        _ => Err(mismatch()),
    }
}

fn call_type(name: &str, args: &[Expression]) -> Result<Type> {
    use Kind::*;
    let n = args.len();
    let arity = |min, max| {
        if (min..=max).contains(&n) {
            Ok(())
        } else {
            Err(mismatch())
        }
    };
    let fixed = |params: &[Kind], minimum, result| {
        arity(minimum, params.len())?;
        for (arg, kind) in args.iter().zip(params) {
            require(arg.kind, *kind)?;
        }
        Ok(Some(result))
    };
    match name {
        "IIF" => {
            arity(3, 3)?;
            require(args[0].kind, Checkbox)?;
            common(args[1..].iter().map(|a| a.kind))
        }
        "IFNULL" | "COALESCE" | "MIN" | "MAX" => {
            arity(2, if name == "IFNULL" { 2 } else { 16 })?;
            common(args.iter().map(|a| a.kind))
        }
        "NULLIF" => {
            arity(2, 2)?;
            binary_type("=", args[0].kind, args[1].kind)?;
            Ok(args[0].kind.or(args[1].kind))
        }
        "ABS" | "CEIL" | "CEILING" | "FLOOR" | "SIGN" | "ROUND" => {
            arity(1, if name == "ROUND" { 2 } else { 1 })?;
            if !numeric(args[0].kind) {
                return Err(mismatch());
            }
            if let Some(digits) = args.get(1) {
                require(digits.kind, Integer)?;
            }
            Ok(match name {
                "ROUND" => Some(Number),
                "SIGN" => Some(Integer),
                _ => args[0].kind,
            })
        }
        "CONCAT" | "CONCAT_WS" | "FORMAT" | "PRINTF" | "CHAR" => {
            arity(if name == "CONCAT_WS" { 2 } else { 1 }, 16)?;
            if name == "CHAR" {
                for a in args {
                    require(a.kind, Integer)?;
                }
            } else if name != "CONCAT" {
                require(args[0].kind, Text)?;
            }
            Ok(Some(Text))
        }
        "GLOB" => fixed(&[Text, Text], 2, Checkbox),
        "LIKE" => fixed(&[Text, Text, Text], 2, Checkbox),
        "INSTR" => fixed(&[Text, Text], 2, Integer),
        "LENGTH" | "OCTET_LENGTH" | "UNICODE" => fixed(&[Text], 1, Integer),
        "LOWER" | "UPPER" => fixed(&[Text], 1, Text),
        "LTRIM" | "RTRIM" | "TRIM" => fixed(&[Text, Text], 1, Text),
        "REPLACE" => fixed(&[Text, Text, Text], 3, Text),
        "SUBSTR" | "SUBSTRING" => fixed(&[Text, Integer, Integer], 2, Text),
        "HEX" | "QUOTE" | "TYPEOF" => {
            arity(1, 1)?;
            Ok(Some(Text))
        }
        "DATE" | "DATETIME" | "JULIANDAY" | "STRFTIME" | "TIME" | "TIMEDIFF" | "UNIXEPOCH" => {
            let start = usize::from(name == "STRFTIME");
            arity(
                if name == "TIMEDIFF" { 2 } else { start + 1 },
                if name == "TIMEDIFF" { 2 } else { 9 },
            )?;
            if start == 1 && !args[0].string_literal {
                return Err(mismatch());
            }
            for (idx, arg) in args.iter().enumerate().skip(start) {
                if idx == start || name == "TIMEDIFF" {
                    if arg.string_literal {
                        if arg.sql.eq_ignore_ascii_case("'now'") {
                            return Err(mismatch());
                        }
                    } else if !matches!(arg.kind, None | Some(Date | Datetime)) {
                        return Err(mismatch());
                    }
                } else if !arg.string_literal
                    || matches!(
                        arg.sql.to_ascii_lowercase().as_str(),
                        "'localtime'" | "'utc'" | "'auto'"
                    )
                    || (name == "UNIXEPOCH"
                        && matches!(
                            arg.sql.to_ascii_lowercase().as_str(),
                            "'subsec'" | "'subsecond'"
                        ))
                {
                    return Err(mismatch());
                }
            }
            Ok(Some(match name {
                "DATE" => Date,
                "DATETIME" => Datetime,
                "JULIANDAY" => Number,
                "UNIXEPOCH" => Integer,
                _ => Text,
            }))
        }
        _ => Err(mismatch()),
    }
}

// Serialize the expression as it is parsed. Remember its binding strength so
// redundant parentheses disappear without changing evaluation order.
struct Expression {
    kind: Type,
    string_literal: bool,
    sql: String,
    precedence: u8,
    unary: bool,
    binary: bool,
    minimum_magnitude: bool,
}

impl Expression {
    fn new(sql: String, precedence: u8) -> Self {
        Self {
            kind: None,
            string_literal: false,
            sql,
            precedence,
            unary: false,
            binary: false,
            minimum_magnitude: false,
        }
    }

    fn typed(mut self, kind: Type) -> Self {
        self.kind = kind;
        self
    }

    fn enclosed(self, condition: bool) -> String {
        if condition {
            format!("({})", self.sql)
        } else {
            self.sql
        }
    }
}

struct Parser<'a> {
    bindings: Option<&'a std::collections::HashMap<String, (String, Kind)>>,
    tokens: std::iter::Peekable<std::vec::IntoIter<Token>>,
}

fn invalid() -> EidosError {
    EidosError::InvalidSchema("Malformed Formula expression".into())
}

impl Parser<'_> {
    fn consume(&mut self, text: &str) -> bool {
        self.tokens.next_if(|token| matches!(token, Token::Symbol(t) | Token::Ident(t) if t.eq_ignore_ascii_case(text))).is_some()
    }

    fn require(&mut self, text: &str) -> Result<()> {
        self.consume(text).then_some(()).ok_or_else(invalid)
    }

    fn expression(&mut self, minimum: u8, depth: usize) -> Result<Expression> {
        if depth > 256 {
            return Err(invalid());
        }
        let token = self.tokens.next().ok_or_else(invalid)?;
        let mut left = match token {
            Token::Number(raw) => {
                let mut expr = Expression::new(number_literal(&raw)?, 9);
                expr.kind = Some(if raw.parse::<i64>().is_ok() {
                    Kind::Integer
                } else {
                    Kind::Number
                });
                expr.minimum_magnitude = raw == "9223372036854775808";
                expr
            }
            Token::StringLit(raw) => {
                let mut e = Expression::new(raw, 9).typed(Some(Kind::Text));
                e.string_literal = true;
                e
            }
            Token::QuotedIdent(name) => match self.bindings {
                Some(bindings) => {
                    let (sql, kind) = bindings.get(&name).ok_or_else(invalid)?;
                    Expression::new(sql.clone(), 9).typed(Some(*kind))
                }
                None => Expression::new(quote_identifier(&name)?, 9),
            },
            Token::Symbol(symbol) if symbol == "(" => {
                let inner = self.expression(1, depth + 1)?;
                self.require(")")?;
                inner
            }
            Token::Symbol(op) if op == "+" || op == "-" => self.unary(&op, 8, depth)?,
            Token::Ident(name) => {
                let name = name.to_ascii_uppercase();
                match name.as_str() {
                    "TRUE" | "FALSE" => Expression::new(name, 9).typed(Some(Kind::Checkbox)),
                    "NULL" => Expression::new(name, 9),
                    "NOT" => self.unary("NOT", 3, depth)?,
                    "TODAY" if self.bindings.is_some() => {
                        self.require("(")?;
                        self.require(")")?;
                        Expression::new(
                            r#"(SELECT "today" FROM "__eidos_formula_calendar")"#.into(),
                            9,
                        )
                        .typed(Some(Kind::Date))
                    }
                    "CAST" => {
                        self.require("(")?;
                        let operand = self.expression(1, depth + 1)?;
                        self.require("AS")?;
                        let Some(Token::Ident(kind)) = self.tokens.next() else {
                            return Err(invalid());
                        };
                        if !matches!(
                            kind.to_ascii_uppercase().as_str(),
                            "TEXT" | "INTEGER" | "REAL"
                        ) {
                            return Err(invalid());
                        }
                        self.require(")")?;
                        Expression::new(
                            format!("CAST({} AS {})", operand.sql, kind.to_ascii_uppercase()),
                            9,
                        )
                        .typed(Some(
                            match kind.to_ascii_uppercase().as_str() {
                                "INTEGER" => Kind::Integer,
                                "REAL" => Kind::Number,
                                _ => Kind::Text,
                            },
                        ))
                    }
                    "CASE" => {
                        let mut sql = String::from("CASE");
                        let mut kinds = Vec::new();
                        self.require("WHEN")?;
                        loop {
                            let test = self.expression(1, depth + 1)?;
                            self.require("THEN")?;
                            let then = self.expression(1, depth + 1)?;
                            if self.bindings.is_some() {
                                require(test.kind, Kind::Checkbox)?;
                                kinds.push(then.kind);
                            }
                            sql.push_str(&format!(" WHEN {} THEN {}", test.sql, then.sql));
                            if !self.consume("WHEN") {
                                break;
                            }
                        }
                        if self.consume("ELSE") {
                            sql.push_str(" ELSE ");
                            let alternative = self.expression(1, depth + 1)?;
                            if self.bindings.is_some() {
                                kinds.push(alternative.kind);
                            }
                            sql.push_str(&alternative.sql);
                        }
                        self.require("END")?;
                        sql.push_str(" END");
                        Expression::new(sql, 9).typed(common(kinds.into_iter())?)
                    }
                    _ => {
                        self.require("(")?;
                        let mut args = Vec::new();
                        if !self.consume(")") {
                            loop {
                                args.push(self.expression(1, depth + 1)?);
                                if !self.consume(",") {
                                    break;
                                }
                            }
                            self.require(")")?;
                        }
                        let kind = if self.bindings.is_some() {
                            call_type(&name, &args)?
                        } else {
                            None
                        };
                        Expression::new(
                            format!(
                                "{}({})",
                                name,
                                args.into_iter()
                                    .map(|a| a.sql)
                                    .collect::<Vec<_>>()
                                    .join(", ")
                            ),
                            9,
                        )
                        .typed(kind)
                    }
                }
            }
            _ => return Err(invalid()),
        };

        while let Some(Token::Symbol(op) | Token::Ident(op)) = self.tokens.peek() {
            let op = op.to_ascii_uppercase();
            let precedence = match op.as_str() {
                "OR" => 1,
                "AND" => 2,
                "IS" | "=" | "==" | "!=" | "<>" | "<" | "<=" | ">" | ">=" => 4,
                "||" => 5,
                "+" | "-" => 6,
                "*" | "/" | "%" => 7,
                _ => break,
            };
            if precedence < minimum {
                break;
            }
            self.tokens.next();
            if op == "IS" {
                let negate = self.consume("NOT");
                self.require("NULL")?;
                let wrap = left.precedence < 5;
                left = Expression::new(
                    format!(
                        "{} IS {}NULL",
                        left.enclosed(wrap),
                        if negate { "NOT " } else { "" }
                    ),
                    4,
                )
                .typed(Some(Kind::Checkbox));
                continue;
            }
            let right = self.expression(precedence + 1, depth + 1)?;
            let wrap_left = left.precedence < precedence
                || (precedence == 4 && left.precedence == 4 && left.binary);
            let wrap_right = right.precedence <= precedence;
            let op = match op.as_str() {
                "==" => "=",
                "<>" => "!=",
                other => other,
            };
            if self.bindings.is_some() {
                let kind = binary_type(op, left.kind, right.kind)?;
                let sql = if matches!(op, "+" | "-" | "*" | "/" | "%") {
                    format!(
                        "eidos_formula_arithmetic('{op}', {}, {})",
                        left.sql, right.sql
                    )
                } else {
                    format!("(({}) {op} ({}))", left.sql, right.sql)
                };
                left = Expression::new(sql, precedence).typed(kind);
                left.binary = true;
                continue;
            }
            left = Expression::new(
                format!(
                    "{} {op} {}",
                    left.enclosed(wrap_left),
                    right.enclosed(wrap_right)
                ),
                precedence,
            );
            left.binary = true;
        }
        Ok(left)
    }

    fn unary(&mut self, op: &str, precedence: u8, depth: usize) -> Result<Expression> {
        let operand = self.expression(precedence + 1, depth + 1)?;
        let wrap = operand.precedence < precedence || operand.unary;
        let kind = if self.bindings.is_none() {
            None
        } else if op == "NOT" {
            require(operand.kind, Kind::Checkbox)?;
            Some(Kind::Checkbox)
        } else if op == "-" && operand.minimum_magnitude {
            Some(Kind::Integer)
        } else if numeric(operand.kind) {
            operand.kind
        } else {
            return Err(mismatch());
        };
        let sql = if op == "-" && operand.minimum_magnitude {
            "-9223372036854775808".into()
        } else if self.bindings.is_some() && op == "-" {
            format!("eidos_formula_arithmetic('-', 0, {})", operand.sql)
        } else {
            format!(
                "{op}{}{}",
                if op == "NOT" { " " } else { "" },
                operand.enclosed(wrap)
            )
        };
        let mut expr = Expression::new(sql, precedence).typed(kind);
        expr.unary = true;
        Ok(expr)
    }
}

fn number_literal(raw: &str) -> Result<String> {
    if raw.bytes().all(|b| b.is_ascii_digit()) && raw.parse::<i64>().is_ok() {
        return Ok(raw.to_owned());
    }
    let value = raw.parse::<f64>().map_err(|_| invalid())?;
    if !value.is_finite() {
        return Err(invalid());
    }
    if value != 0.0 && !(1e-6..1e21).contains(&value.abs()) {
        let scientific = format!("{value:e}");
        let (base, exponent) = scientific.split_once('e').ok_or_else(invalid)?;
        let exponent = exponent.parse::<i32>().map_err(|_| invalid())?;
        return Ok(format!("{base}e{exponent:+}"));
    }
    let mut text = value.to_string();
    if !text.contains('.') {
        text.push_str(".0");
    }
    Ok(text)
}

/// Emit parenthesized SQL using resolved, trusted field expressions.
pub fn compile_bound_source(
    tokens: Vec<Token>,
    bindings: &std::collections::HashMap<String, (String, Kind)>,
) -> Result<(String, Option<Kind>)> {
    let mut parser = Parser {
        tokens: tokens.into_iter().peekable(),
        bindings: Some(bindings),
    };
    let expression = parser.expression(1, 0)?;
    if parser.tokens.next().is_some() {
        return Err(invalid());
    }
    Ok((expression.sql, expression.kind))
}

pub fn rename_reference(source: &str, old: &str, new: &str) -> Result<Option<String>> {
    if old == new {
        return Ok(None);
    }
    let mut tokens = tokenize(source).map_err(EidosError::InvalidSchema)?;
    let mut changed = false;
    for token in &mut tokens {
        if let Token::QuotedIdent(name) = token
            && name == old
        {
            *name = new.to_owned();
            changed = true;
        }
    }
    if !changed {
        return Ok(None);
    }
    let mut parser = Parser {
        bindings: None,
        tokens: tokens.into_iter().peekable(),
    };
    let expression = parser.expression(1, 0)?;
    if parser.tokens.next().is_some() {
        return Err(invalid());
    }
    Ok(Some(expression.sql))
}

#[cfg(test)]
mod tests {
    use super::rename_reference;
    #[test]
    fn rename_serializes_the_standard_formula_grammar() {
        for (source, expected) in [
            (
                r#"lower ( "A" )||'A'||"Q""R""S""#,
                r#"LOWER("B") || 'A' || "Q""R""S""#,
            ),
            (
                r#"case when "A" is not null then cast("A" as text) else 'n/a' end"#,
                r#"CASE WHEN "B" IS NOT NULL THEN CAST("B" AS TEXT) ELSE 'n/a' END"#,
            ),
            (r#"(("A"))*(2+3)-(-(-4))"#, r#""B" * (2 + 3) - -(-4)"#),
            (
                r#"not ("A" == 1.00) or ("A" <> -9223372036854775808)"#,
                r#"NOT "B" = 1.0 OR "B" != -9223372036854775808"#,
            ),
        ] {
            assert_eq!(
                rename_reference(source, "A", "B").unwrap().as_deref(),
                Some(expected)
            );
        }
    }
}
