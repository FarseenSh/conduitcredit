# ConduitCredit Nautilus enclave image (built into the Marlin Oyster CVM / AWS Nitro EIF).
# The image contents determine PCR0/1/2; the docker-compose determines PCR16. Keep both
# frozen once registered on chain.
FROM rust:1.96-slim AS build
WORKDIR /app
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release --features server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/release/nautilus-server /usr/local/bin/nautilus-server
COPY allowed_endpoints.yaml /etc/nautilus/allowed_endpoints.yaml
EXPOSE 3030
ENTRYPOINT ["/usr/local/bin/nautilus-server"]
