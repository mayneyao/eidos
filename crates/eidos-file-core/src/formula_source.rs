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

// Serialize the expression as it is parsed. Remember its binding strength so
// redundant parentheses disappear without changing evaluation order.
struct Expression {
    sql: String,
    precedence: u8,
    unary: bool,
    binary: bool,
    minimum_magnitude: bool,
}

impl Expression {
    fn new(sql: String, precedence: u8) -> Self {
        Self {
            sql,
            precedence,
            unary: false,
            binary: false,
            minimum_magnitude: false,
        }
    }

    fn enclosed(self, condition: bool) -> String {
        if condition {
            format!("({})", self.sql)
        } else {
            self.sql
        }
    }
}

struct Parser {
    tokens: std::iter::Peekable<std::vec::IntoIter<Token>>,
}

fn invalid() -> EidosError {
    EidosError::InvalidSchema("Malformed Formula expression".into())
}

impl Parser {
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
                expr.minimum_magnitude = raw == "9223372036854775808";
                expr
            }
            Token::StringLit(raw) => Expression::new(raw, 9),
            Token::QuotedIdent(name) => Expression::new(quote_identifier(&name)?, 9),
            Token::Symbol(symbol) if symbol == "(" => {
                let inner = self.expression(1, depth + 1)?;
                self.require(")")?;
                inner
            }
            Token::Symbol(op) if op == "+" || op == "-" => self.unary(&op, 8, depth)?,
            Token::Ident(name) => {
                let name = name.to_ascii_uppercase();
                match name.as_str() {
                    "TRUE" | "FALSE" | "NULL" => Expression::new(name, 9),
                    "NOT" => self.unary("NOT", 3, depth)?,
                    "CAST" => {
                        self.require("(")?;
                        let operand = self.expression(1, depth + 1)?;
                        self.require("AS")?;
                        let Some(Token::Ident(kind)) = self.tokens.next() else {
                            return Err(invalid());
                        };
                        self.require(")")?;
                        Expression::new(
                            format!("CAST({} AS {})", operand.sql, kind.to_ascii_uppercase()),
                            9,
                        )
                    }
                    "CASE" => {
                        let mut sql = String::from("CASE");
                        self.require("WHEN")?;
                        loop {
                            let test = self.expression(1, depth + 1)?;
                            self.require("THEN")?;
                            let then = self.expression(1, depth + 1)?;
                            sql.push_str(&format!(" WHEN {} THEN {}", test.sql, then.sql));
                            if !self.consume("WHEN") {
                                break;
                            }
                        }
                        if self.consume("ELSE") {
                            sql.push_str(" ELSE ");
                            sql.push_str(&self.expression(1, depth + 1)?.sql);
                        }
                        self.require("END")?;
                        sql.push_str(" END");
                        Expression::new(sql, 9)
                    }
                    _ => {
                        self.require("(")?;
                        let mut args = Vec::new();
                        if !self.consume(")") {
                            loop {
                                args.push(self.expression(1, depth + 1)?.sql);
                                if !self.consume(",") {
                                    break;
                                }
                            }
                            self.require(")")?;
                        }
                        Expression::new(format!("{}({})", name, args.join(", ")), 9)
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
                );
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
        let sql = if op == "-" && operand.minimum_magnitude {
            "-9223372036854775808".into()
        } else {
            format!(
                "{op}{}{}",
                if op == "NOT" { " " } else { "" },
                operand.enclosed(wrap)
            )
        };
        let mut expr = Expression::new(sql, precedence);
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
