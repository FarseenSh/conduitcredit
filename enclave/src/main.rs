//! ConduitCredit nautilus-server (Rust/axum). Built with `--features server`.
//!
//! POST /attest_income { borrower, income_6mo_avg_usdc, data_source? }
//!   → { borrower, income_6mo_avg_usdc, data_source, fetch_ts_ms, timestamp_ms, signature_hex, pk_hex }
//! GET  /health
//!
//! PRODUCTION: replace the supplied income with a real Plaid read of /identity/get +
//! /income/verification/paystubs (keys from AWS Secrets Manager, fetched at runtime INSIDE
//! the enclave) and compute the 6-month average here. The raw statements never leave the enclave.
use axum::{routing::{get, post}, Json, Router};
use nautilus_server::{sign_credit_attestation, CreditPayload};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Deserialize)]
struct AttestRequest {
    borrower: String,
    income_6mo_avg_usdc: u64,
    data_source: Option<String>,
}

#[derive(Serialize)]
struct AttestResponse {
    borrower: String,
    income_6mo_avg_usdc: u64,
    data_source: String,
    fetch_ts_ms: u64,
    timestamp_ms: u64,
    signature_hex: String,
    pk_hex: String,
}

fn addr_bytes(s: &str) -> [u8; 32] {
    let h = hex::decode(s.trim_start_matches("0x")).expect("hex addr");
    let mut out = [0u8; 32];
    out[32 - h.len()..].copy_from_slice(&h);
    out
}

async fn attest(Json(req): Json<AttestRequest>) -> Json<AttestResponse> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;
    let data_source = req.data_source.unwrap_or_else(|| "plaid".to_string());
    let payload = CreditPayload {
        borrower: addr_bytes(&req.borrower),
        income_6mo_avg_usdc: req.income_6mo_avg_usdc,
        data_source: data_source.clone().into_bytes(),
        fetch_ts_ms: now,
    };
    let signed = sign_credit_attestation(payload, now);
    Json(AttestResponse {
        borrower: req.borrower,
        income_6mo_avg_usdc: req.income_6mo_avg_usdc,
        data_source,
        fetch_ts_ms: now,
        timestamp_ms: now,
        signature_hex: hex::encode(signed.signature),
        pk_hex: hex::encode(signed.public_key),
    })
}

async fn health() -> &'static str {
    "ok"
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/health", get(health))
        .route("/attest_income", post(attest));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3030").await.unwrap();
    println!("ConduitCredit nautilus-server listening on :3030");
    axum::serve(listener, app).await.unwrap();
}
