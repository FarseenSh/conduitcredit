//! ConduitCredit nautilus-server (Rust/axum). Built with `--features server`.
//!
//! POST /attest_income { borrower, monthly_net_usdc? | income_6mo_avg_usdc?, data_source? }
//!   → { borrower, income_6mo_avg_usdc, data_source, fetch_ts_ms, timestamp_ms, signature_hex, pk_hex }
//! GET  /health
//!
//! The enclave computes the 6-month average INSIDE the TEE: pass `monthly_net_usdc` (the raw
//! per-month inflows) and it averages them via `average_6mo_income`, or pass a pre-computed
//! `income_6mo_avg_usdc`. PRODUCTION: the monthly inflows come from a real Plaid read of
//! /identity/get + /income/verification/paystubs (keys from AWS Secrets Manager, fetched at
//! runtime INSIDE the enclave); the raw statements never leave the enclave — only the signed average.
use axum::{routing::{get, post}, Json, Router};
use nautilus_server::{average_6mo_income, sign_credit_attestation, CreditPayload};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Deserialize)]
struct AttestRequest {
    borrower: String,
    /// Pre-computed 6-month average (base units, 6-dp). Optional if `monthly_net_usdc` is given.
    income_6mo_avg_usdc: Option<u64>,
    /// OR the raw per-month net deposits the enclave read — it averages them INSIDE the TEE.
    monthly_net_usdc: Option<Vec<u64>>,
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
    // Average the raw months inside the enclave when provided; else accept a pre-computed value.
    let income_6mo_avg_usdc = match req.monthly_net_usdc.as_ref() {
        Some(months) => average_6mo_income(months),
        None => req.income_6mo_avg_usdc.unwrap_or(0),
    };
    let payload = CreditPayload {
        borrower: addr_bytes(&req.borrower),
        income_6mo_avg_usdc,
        data_source: data_source.clone().into_bytes(),
        fetch_ts_ms: now,
    };
    let signed = sign_credit_attestation(payload, now);
    Json(AttestResponse {
        borrower: req.borrower,
        income_6mo_avg_usdc,
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
