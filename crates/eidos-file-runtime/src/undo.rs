//! Bounded in-memory undo/redo stack for reversible row deletions.

use std::collections::{HashMap, VecDeque};

use rusqlite::types::Value as SqlValue;

#[derive(Debug, Clone, PartialEq)]
pub struct DeletedRowSnapshot {
    pub row_id: String,
    pub columns: Vec<String>,
    pub values: Vec<SqlValue>,
}

#[derive(Debug, Clone)]
pub struct RowDeletionUndoState {
    pub table_id: String,
    pub physical_table: String,
    pub rows: Vec<DeletedRowSnapshot>,
    pub forward_columns: Vec<String>,
    pub detached: Vec<eidos_file_core::relation::DetachedCell>,
}

#[derive(Debug, Clone)]
pub enum UndoEntry {
    RestoreDelete(RowDeletionUndoState),
    RepeatDelete(RowDeletionUndoState),
}

pub struct UndoStore {
    max_entries: usize,
    order: VecDeque<String>,
    entries: HashMap<String, UndoEntry>,
    seq: u64,
}

impl UndoStore {
    pub fn new(max_entries: usize) -> Self {
        Self {
            max_entries: max_entries.max(1),
            order: VecDeque::new(),
            entries: HashMap::new(),
            seq: 0,
        }
    }

    pub fn push(&mut self, entry: UndoEntry) -> (String, Vec<String>) {
        self.seq += 1;
        let token = format!("undo-rust-{}", self.seq);
        let mut evicted = Vec::new();
        while self.order.len() >= self.max_entries {
            if let Some(old) = self.order.pop_front() {
                self.entries.remove(&old);
                evicted.push(old);
            }
        }
        self.order.push_back(token.clone());
        self.entries.insert(token.clone(), entry);
        (token, evicted)
    }

    pub fn get(&self, token: &str) -> Option<&UndoEntry> {
        self.entries.get(token)
    }

    pub fn put_with_token(&mut self, token: String, entry: UndoEntry) {
        if !self.entries.contains_key(&token) {
            self.order.push_back(token.clone());
        }
        self.entries.insert(token, entry);
    }

    pub fn clear(&mut self) {
        self.order.clear();
        self.entries.clear();
    }
}
