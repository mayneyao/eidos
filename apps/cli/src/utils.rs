//! Utility functions for CLI output formatting

use unicode_width::UnicodeWidthStr;

/// Output format for CLI commands
#[derive(Clone, Copy, Debug, Default, clap::ValueEnum)]
pub enum OutputFormat {
    #[default]
    Table,
    Json,
}

/// Strip ANSI escape sequences from string
pub fn strip_ansi(s: &str) -> String {
    let mut result = String::new();
    let mut chars = s.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\x1b' {
            if chars.peek() == Some(&'[') {
                chars.next();
                while let Some(c) = chars.next() {
                    if c.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
        } else {
            result.push(ch);
        }
    }

    result
}

/// Pad string to target display width, accounting for CJK and emoji
pub fn pad_to_width(s: &str, target_width: usize) -> String {
    let plain = strip_ansi(s);
    let display_width = plain.width();
    if display_width >= target_width {
        s.to_string()
    } else {
        let padding = target_width - display_width;
        format!("{}{}", s, " ".repeat(padding))
    }
}
