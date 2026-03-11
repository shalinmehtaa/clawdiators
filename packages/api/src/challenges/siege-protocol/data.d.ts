// @source-hash 1f64fe7de6fcd54185d8dfada20c633191e0b92652af0152c23577e73520f824
/**
 * SIEGE PROTOCOL -- Data Generator
 *
 * Generates a fully seeded DDoS attack scenario against the AEGIS distributed
 * financial trading platform. Each seed produces a unique but deterministic
 * incident with a specific primary attack vector, secondary diversionary
 * attacks, and a correct mitigation sequence across 5 network zones.
 *
 * The same seed always produces the same scenario -- enabling reproducible
 * scoring even across multiple submission attempts.
 */
export declare const NETWORK_ZONES: readonly [{
    readonly id: "edge-ingress";
    readonly name: "Edge Ingress Layer";
    readonly description: "CDN and WAF layer handling incoming client connections from 12 regional PoPs (Points of Presence). First line of defense with L3/L4 filtering, TLS termination, and geographic rate limiting.";
    readonly upstream: string[];
    readonly downstream: readonly ["api-gateway"];
    readonly sla: {
        readonly max_latency_ms: 50;
        readonly max_connection_queue: 10000;
        readonly min_throughput_rps: 50000;
        readonly max_error_rate: 0.001;
    };
    readonly ports: {
        readonly public: 443;
        readonly metrics: 9100;
    };
}, {
    readonly id: "api-gateway";
    readonly name: "API Gateway Cluster";
    readonly description: "Application-layer gateway handling authentication, request routing, rate limiting, and protocol translation across 8 gateway instances with consistent hashing.";
    readonly upstream: readonly ["edge-ingress"];
    readonly downstream: readonly ["order-engine", "market-data"];
    readonly sla: {
        readonly max_latency_ms: 100;
        readonly max_queue_depth: 5000;
        readonly min_throughput_rps: 30000;
        readonly max_error_rate: 0.005;
    };
    readonly ports: {
        readonly internal: 8080;
        readonly metrics: 9101;
    };
}, {
    readonly id: "order-engine";
    readonly name: "Order Matching Engine";
    readonly description: "Ultra-low-latency order matching engine processing limit and market orders across 4 asset classes. FPGA-accelerated matching with in-memory order book replicated across 3 nodes.";
    readonly upstream: readonly ["api-gateway"];
    readonly downstream: readonly ["settlement-bus"];
    readonly sla: {
        readonly max_latency_ms: 5;
        readonly max_order_queue: 2000;
        readonly min_throughput_ops: 100000;
        readonly max_error_rate: 0.0001;
    };
    readonly ports: {
        readonly internal: 8081;
        readonly metrics: 9102;
    };
}, {
    readonly id: "market-data";
    readonly name: "Market Data Distribution";
    readonly description: "Real-time market data feed serving price ticks, order book snapshots, and trade prints to 3,200+ connected subscribers via WebSocket and FIX protocol.";
    readonly upstream: readonly ["api-gateway", "order-engine"];
    readonly downstream: readonly ["settlement-bus"];
    readonly sla: {
        readonly max_latency_ms: 10;
        readonly max_subscriber_lag_ms: 50;
        readonly min_feed_rate_tps: 200000;
        readonly max_stale_pct: 0.01;
    };
    readonly ports: {
        readonly ws: 8082;
        readonly fix: 8083;
        readonly metrics: 9103;
    };
}, {
    readonly id: "settlement-bus";
    readonly name: "Settlement & Clearing Bus";
    readonly description: "Event-driven settlement pipeline processing trade confirmations, position updates, and clearing house submissions. Kafka-backed with exactly-once semantics and 4-hour settlement window.";
    readonly upstream: readonly ["order-engine", "market-data"];
    readonly downstream: string[];
    readonly sla: {
        readonly max_latency_ms: 500;
        readonly max_pending_settlements: 10000;
        readonly min_throughput_tps: 5000;
        readonly max_error_rate: 0.001;
    };
    readonly ports: {
        readonly internal: 8084;
        readonly kafka: 9092;
        readonly metrics: 9104;
    };
}];
export type ZoneId = "edge-ingress" | "api-gateway" | "order-engine" | "market-data" | "settlement-bus";
export declare const ATTACK_SCENARIOS: readonly [{
    readonly id: "volumetric_syn_flood";
    readonly name: "Volumetric SYN Flood with Application-Layer Amplification";
    readonly primaryVector: ZoneId;
    readonly attackType: "volumetric";
    readonly impactChain: ZoneId[];
    readonly description: "A massive SYN flood (47 Gbps) from a botnet of 12,000+ compromised IoT devices is overwhelming the edge ingress layer. The attack includes application-layer amplification via crafted HTTPS requests that trigger expensive TLS renegotiation. Connection tables on edge PoPs are saturating, causing legitimate traffic to queue and timeout.";
    readonly attackSignals: readonly ["SYN_FLOOD_DETECTED", "CONNECTION_TABLE_SATURATED", "TLS_RENEGOTIATION_ABUSE", "POP_CAPACITY_EXCEEDED"];
    readonly flowSignals: {
        readonly source_entropy: "low (concentrated in 3 ASNs)";
        readonly packet_size_distribution: "bimodal (64-byte SYN + 1400-byte TLS)";
        readonly geo_distribution: "97% from 3 countries (unusual)";
    };
    readonly mitigationSequence: readonly [{
        readonly zone: ZoneId;
        readonly action: "enable_syn_cookies";
        readonly params: {
            readonly mode: "aggressive";
        };
        readonly description: "Enable SYN cookies to handle half-open connections without consuming connection table entries";
    }, {
        readonly zone: ZoneId;
        readonly action: "deploy_geo_ratelimit";
        readonly params: {
            readonly countries: readonly ["source_country_1", "source_country_2", "source_country_3"];
            readonly limit_rps: 100;
        };
        readonly description: "Apply geographic rate limits to the 3 source countries";
    }, {
        readonly zone: ZoneId;
        readonly action: "block_tls_renegotiation";
        readonly params: {};
        readonly description: "Disable TLS renegotiation to prevent amplification vector";
    }, {
        readonly zone: ZoneId;
        readonly action: "drain_stale_connections";
        readonly params: {
            readonly older_than_secs: 30;
        };
        readonly description: "Drain stale connections that accumulated during the flood";
    }, {
        readonly zone: ZoneId;
        readonly action: "resume_matching";
        readonly params: {};
        readonly description: "Resume order matching after upstream pressure is relieved";
    }];
    readonly diversion: {
        readonly zone: ZoneId;
        readonly symptom: "WebSocket disconnect storm (800+ subscribers dropped in 2 minutes)";
        readonly actualCause: "Subscribers disconnected due to upstream latency exceeding keepalive timeout -- symptom of edge saturation, not a market-data attack";
    };
    readonly secondaryDiversion: {
        readonly zone: ZoneId;
        readonly symptom: "Settlement confirmation latency spiked to 12 seconds";
    };
    readonly onsetTimestamp: "T-3h";
}, {
    readonly id: "slowloris_api_exhaustion";
    readonly name: "Slowloris Connection Exhaustion via API Gateway";
    readonly primaryVector: ZoneId;
    readonly attackType: "connection-exhaustion";
    readonly impactChain: ZoneId[];
    readonly description: "A sophisticated Slowloris attack is holding 6,400+ connections open on the API gateway by sending incomplete HTTP headers at 1 byte per 30 seconds. Each connection consumes a worker thread. With 8 gateway instances running 800 worker threads each, legitimate requests are starving for available workers. The attack evades L3/L4 filters because established connections look normal at the network level.";
    readonly attackSignals: readonly ["WORKER_THREAD_EXHAUSTION", "SLOWLORIS_PATTERN_DETECTED", "KEEPALIVE_ANOMALY", "REQUEST_QUEUE_OVERFLOW"];
    readonly flowSignals: {
        readonly connection_duration: "extremely high (avg 340s vs normal 2.1s)";
        readonly bytes_per_second: "near-zero on 6400+ connections";
        readonly header_completion_rate: "0.3% (normal: 99.7%)";
    };
    readonly mitigationSequence: readonly [{
        readonly zone: ZoneId;
        readonly action: "set_header_timeout";
        readonly params: {
            readonly timeout_secs: 5;
        };
        readonly description: "Reduce HTTP header completion timeout from 120s to 5s";
    }, {
        readonly zone: ZoneId;
        readonly action: "kill_slow_connections";
        readonly params: {
            readonly min_bytes_per_sec: 100;
        };
        readonly description: "Terminate connections sending fewer than 100 bytes/sec";
    }, {
        readonly zone: ZoneId;
        readonly action: "enable_connection_rate_limit";
        readonly params: {
            readonly per_ip_limit: 10;
        };
        readonly description: "Limit concurrent connections per source IP";
    }, {
        readonly zone: ZoneId;
        readonly action: "clear_pending_queue";
        readonly params: {};
        readonly description: "Clear the order queue that accumulated during thread starvation";
    }, {
        readonly zone: ZoneId;
        readonly action: "reconnect_subscribers";
        readonly params: {};
        readonly description: "Trigger subscriber reconnection after gateway recovery";
    }];
    readonly diversion: {
        readonly zone: ZoneId;
        readonly symptom: "Edge PoP latency elevated (3.2x baseline)";
        readonly actualCause: "Legitimate traffic spike from market open in Asian session -- normal pattern, not an attack on the edge layer";
    };
    readonly secondaryDiversion: {
        readonly zone: ZoneId;
        readonly symptom: "Kafka consumer lag growing on settlement topic";
    };
    readonly onsetTimestamp: "T-2h";
}, {
    readonly id: "order_injection_dos";
    readonly name: "Malicious Order Injection Denial-of-Service";
    readonly primaryVector: ZoneId;
    readonly attackType: "application-layer";
    readonly impactChain: ZoneId[];
    readonly description: "A compromised API key (belonging to a high-frequency trading firm with elevated rate limits) is injecting 45,000 orders/sec of pathological limit orders designed to fragment the order book. Orders are placed 1 tick outside the spread, immediately cancelled, then resubmitted -- creating a cancel-replace storm that overwhelms the matching engine's memory allocator. The order book for 3 asset classes has grown to 4.7 million entries.";
    readonly attackSignals: readonly ["ORDER_BOOK_FRAGMENTATION", "CANCEL_REPLACE_STORM", "MEMORY_ALLOCATOR_PRESSURE", "MATCHING_LATENCY_SPIKE"];
    readonly flowSignals: {
        readonly order_cancel_ratio: "99.7% (normal: 60-70%)";
        readonly unique_price_levels: "4.7M (normal: ~12K)";
        readonly source_api_key: "single key generating 78% of all traffic";
    };
    readonly mitigationSequence: readonly [{
        readonly zone: ZoneId;
        readonly action: "suspend_api_key";
        readonly params: {
            readonly key_id: "compromised_key";
        };
        readonly description: "Suspend the compromised API key to stop malicious order flow";
    }, {
        readonly zone: ZoneId;
        readonly action: "purge_phantom_orders";
        readonly params: {
            readonly cancel_ratio_threshold: 0.95;
        };
        readonly description: "Purge orders from sources with >95% cancel rate";
    }, {
        readonly zone: ZoneId;
        readonly action: "compact_order_book";
        readonly params: {
            readonly asset_classes: readonly ["all"];
        };
        readonly description: "Run order book compaction to reclaim fragmented memory";
    }, {
        readonly zone: ZoneId;
        readonly action: "flush_stale_snapshots";
        readonly params: {};
        readonly description: "Flush corrupted order book snapshots from the data feed";
    }, {
        readonly zone: ZoneId;
        readonly action: "reconcile_phantom_fills";
        readonly params: {};
        readonly description: "Reconcile and void any fills against phantom orders";
    }];
    readonly diversion: {
        readonly zone: ZoneId;
        readonly symptom: "Authentication service latency elevated (4.1x normal)";
        readonly actualCause: "Auth service is slow because it is processing the elevated legitimate order volume triggered by market volatility -- a symptom of overall load, not an auth attack";
    };
    readonly secondaryDiversion: {
        readonly zone: ZoneId;
        readonly symptom: "TLS handshake failure rate increased to 2.3%";
    };
    readonly onsetTimestamp: "T-4h";
}, {
    readonly id: "websocket_amplification";
    readonly name: "WebSocket Subscription Amplification Attack";
    readonly primaryVector: ZoneId;
    readonly attackType: "amplification";
    readonly impactChain: ZoneId[];
    readonly description: "An attacker is exploiting the market data subscription protocol to create an amplification attack. By subscribing to all 847 instrument feeds across 4 asset classes with high-frequency snapshot requests, a single connection generates 140 MB/s of outbound traffic. 200+ such connections are consuming 28 GB/s of egress bandwidth, saturating the market data distribution layer and causing legitimate subscribers to receive stale data.";
    readonly attackSignals: readonly ["SUBSCRIPTION_AMPLIFICATION", "EGRESS_BANDWIDTH_SATURATED", "SNAPSHOT_RATE_ABUSE", "SUBSCRIBER_STALE_DATA"];
    readonly flowSignals: {
        readonly egress_bandwidth: "28.4 GB/s (capacity: 32 GB/s, normal: 4.2 GB/s)";
        readonly subscriptions_per_connection: "847 (normal avg: 23)";
        readonly snapshot_request_rate: "500/sec per connection (normal: 2/sec)";
    };
    readonly mitigationSequence: readonly [{
        readonly zone: ZoneId;
        readonly action: "enforce_subscription_cap";
        readonly params: {
            readonly max_per_connection: 50;
        };
        readonly description: "Cap subscriptions per connection to 50 instruments";
    }, {
        readonly zone: ZoneId;
        readonly action: "throttle_snapshot_rate";
        readonly params: {
            readonly max_per_sec: 5;
        };
        readonly description: "Rate-limit snapshot requests to 5/sec per connection";
    }, {
        readonly zone: ZoneId;
        readonly action: "disconnect_abusive_sessions";
        readonly params: {
            readonly subscription_threshold: 200;
        };
        readonly description: "Disconnect sessions with more than 200 subscriptions";
    }, {
        readonly zone: ZoneId;
        readonly action: "enable_egress_shaping";
        readonly params: {
            readonly max_mbps_per_client: 10;
        };
        readonly description: "Enable per-client egress bandwidth shaping at the gateway";
    }, {
        readonly zone: ZoneId;
        readonly action: "resync_trade_feed";
        readonly params: {};
        readonly description: "Resync trade feed after market data stabilizes";
    }];
    readonly diversion: {
        readonly zone: ZoneId;
        readonly symptom: "Order matching latency increased to 45ms (SLA: 5ms)";
        readonly actualCause: "Matching engine is processing a legitimate block trade that locked the order book for 40ms -- normal for large institutional orders, not related to the DDoS";
    };
    readonly secondaryDiversion: {
        readonly zone: ZoneId;
        readonly symptom: "Geographic distribution of traffic shifted (70% APAC vs normal 30%)";
    };
    readonly onsetTimestamp: "T-1.5h";
}, {
    readonly id: "settlement_kafka_flood";
    readonly name: "Settlement Bus Kafka Partition Flooding";
    readonly primaryVector: ZoneId;
    readonly attackType: "resource-exhaustion";
    readonly impactChain: ZoneId[];
    readonly description: "A compromised internal service account is flooding the Kafka settlement topic with 2.8 million malformed settlement messages. Each message is 64KB (max allowed size), filling partition logs and causing consumer lag to exceed 4 hours. The settlement pipeline is backed up, triggering regulatory alerts for T+0 settlement breaches. The order engine has started rejecting new orders because unsettled position limits are being hit.";
    readonly attackSignals: readonly ["KAFKA_PARTITION_FLOOD", "CONSUMER_LAG_CRITICAL", "SETTLEMENT_WINDOW_BREACH", "POSITION_LIMIT_HIT"];
    readonly flowSignals: {
        readonly message_size_distribution: "99.2% at max size (64KB) vs normal avg 1.2KB";
        readonly producer_client_id: "single service account generating 94% of traffic";
        readonly consumer_lag_hours: "4.2h (SLA: 15min)";
    };
    readonly mitigationSequence: readonly [{
        readonly zone: ZoneId;
        readonly action: "revoke_service_account";
        readonly params: {
            readonly account_id: "compromised_svc";
        };
        readonly description: "Revoke the compromised service account credentials";
    }, {
        readonly zone: ZoneId;
        readonly action: "purge_malformed_messages";
        readonly params: {
            readonly size_threshold_kb: 32;
        };
        readonly description: "Purge messages exceeding 32KB (all malformed)";
    }, {
        readonly zone: ZoneId;
        readonly action: "reset_consumer_offsets";
        readonly params: {
            readonly to: "latest_valid";
        };
        readonly description: "Reset consumer offsets to skip the flood and resume from valid messages";
    }, {
        readonly zone: ZoneId;
        readonly action: "recalculate_positions";
        readonly params: {};
        readonly description: "Recalculate position limits after purging invalid settlements";
    }, {
        readonly zone: ZoneId;
        readonly action: "publish_settlement_correction";
        readonly params: {};
        readonly description: "Publish corrected settlement status to market data subscribers";
    }];
    readonly diversion: {
        readonly zone: ZoneId;
        readonly symptom: "API latency percentiles degraded (p99: 2.8s vs SLA 100ms)";
        readonly actualCause: "Gateway is experiencing elevated latency because the order engine is rejecting orders -- the gateway retries create additional load, but the root cause is settlement-bus, not the gateway";
    };
    readonly secondaryDiversion: {
        readonly zone: ZoneId;
        readonly symptom: "Connection retry rate elevated from client-side timeouts";
    };
    readonly onsetTimestamp: "T-4h";
}, {
    readonly id: "dns_reflection_edge";
    readonly name: "DNS Reflection Attack on Edge Infrastructure";
    readonly primaryVector: ZoneId;
    readonly attackType: "reflection-amplification";
    readonly impactChain: ZoneId[];
    readonly description: "A DNS reflection/amplification attack is directing 62 Gbps of UDP DNS response traffic at the edge ingress layer. The attacker is using spoofed source IPs matching AEGIS edge PoP addresses in DNS queries sent to 4,800 open resolvers. The resulting amplified responses (60x amplification factor) are saturating edge uplinks. Unlike a direct SYN flood, the traffic originates from legitimate DNS resolvers, making IP-based blocking counterproductive.";
    readonly attackSignals: readonly ["DNS_REFLECTION_DETECTED", "UDP_FLOOD_INGRESS", "UPLINK_SATURATION", "LEGITIMATE_RESOLVER_TRAFFIC"];
    readonly flowSignals: {
        readonly protocol_distribution: "94% UDP/53 responses (normal: <1%)";
        readonly source_type: "legitimate DNS resolvers (not spoofable IPs)";
        readonly amplification_factor: "~60x observed";
    };
    readonly mitigationSequence: readonly [{
        readonly zone: ZoneId;
        readonly action: "enable_udp_scrubbing";
        readonly params: {
            readonly protocol: "dns";
            readonly mode: "aggressive";
        };
        readonly description: "Enable DNS-specific UDP scrubbing at the edge";
    }, {
        readonly zone: ZoneId;
        readonly action: "activate_upstream_blackhole";
        readonly params: {
            readonly protocol: "udp";
            readonly port: 53;
        };
        readonly description: "Request upstream ISP to blackhole UDP/53 traffic via BGP flowspec";
    }, {
        readonly zone: ZoneId;
        readonly action: "failover_pops";
        readonly params: {
            readonly affected_pops: readonly ["pop-eu-1", "pop-us-east-1"];
        };
        readonly description: "Failover saturated PoPs to backup capacity";
    }, {
        readonly zone: ZoneId;
        readonly action: "enable_circuit_breaker";
        readonly params: {
            readonly threshold: 0.5;
        };
        readonly description: "Enable circuit breakers on gateway connections to affected PoPs";
    }];
    readonly diversion: {
        readonly zone: ZoneId;
        readonly symptom: "Order rejection rate increased to 4.7% (normal: 0.1%)";
        readonly actualCause: "Legitimate orders are being rejected because clients cannot maintain connections through the saturated edge -- the order engine itself is healthy";
    };
    readonly secondaryDiversion: {
        readonly zone: ZoneId;
        readonly symptom: "Market data feed gap detected (47 seconds of missing ticks)";
    };
    readonly onsetTimestamp: "T-1h";
}, {
    readonly id: "api_credential_stuffing";
    readonly name: "Credential Stuffing via API Authentication Endpoint";
    readonly primaryVector: ZoneId;
    readonly attackType: "credential-stuffing";
    readonly impactChain: ZoneId[];
    readonly description: "A credential stuffing attack is targeting the API gateway authentication endpoint with 28,000 login attempts per minute using a leaked credential database. The authentication service's bcrypt verification is CPU-bound, and the sustained attack load has caused 6 of 8 gateway instances to hit 100% CPU. Legitimate authentication requests are timing out, and authenticated sessions are expiring without renewal. 340 trading accounts have been locked due to failed attempt thresholds.";
    readonly attackSignals: readonly ["CREDENTIAL_STUFFING_DETECTED", "AUTH_CPU_SATURATION", "SESSION_EXPIRY_STORM", "ACCOUNT_LOCKOUT_SURGE"];
    readonly flowSignals: {
        readonly auth_attempt_rate: "28,000/min (normal: 200/min)";
        readonly unique_usernames: "12,000+ in last hour (normal: ~50 unique/hour)";
        readonly success_rate: "0.02% (7 successful compromises detected)";
    };
    readonly mitigationSequence: readonly [{
        readonly zone: ZoneId;
        readonly action: "enable_auth_rate_limit";
        readonly params: {
            readonly per_ip_limit: 3;
            readonly window_secs: 60;
        };
        readonly description: "Rate-limit authentication attempts to 3 per IP per minute";
    }, {
        readonly zone: ZoneId;
        readonly action: "block_known_credential_sources";
        readonly params: {
            readonly asn_list: readonly ["compromised_asn_1", "compromised_asn_2"];
        };
        readonly description: "Block authentication from ASNs generating >90% of attempts";
    }, {
        readonly zone: ZoneId;
        readonly action: "force_mfa_compromised_accounts";
        readonly params: {
            readonly account_count: 7;
        };
        readonly description: "Force MFA re-enrollment on the 7 compromised accounts";
    }, {
        readonly zone: ZoneId;
        readonly action: "unlock_legitimate_accounts";
        readonly params: {};
        readonly description: "Unlock the 340 accounts locked by collateral failed-attempt triggers";
    }, {
        readonly zone: ZoneId;
        readonly action: "void_unauthorized_orders";
        readonly params: {};
        readonly description: "Void any orders placed via the 7 compromised accounts";
    }, {
        readonly zone: ZoneId;
        readonly action: "halt_compromised_settlements";
        readonly params: {};
        readonly description: "Halt settlement processing for trades from compromised accounts";
    }];
    readonly diversion: {
        readonly zone: ZoneId;
        readonly symptom: "Edge connection rate 2.8x normal baseline";
        readonly actualCause: "The elevated connection rate is from credential stuffing attempts, which are valid TCP connections -- not a separate edge-layer attack";
    };
    readonly secondaryDiversion: {
        readonly zone: ZoneId;
        readonly symptom: "FIX protocol session disconnects increasing";
    };
    readonly onsetTimestamp: "T-3h";
}, {
    readonly id: "memcached_amplification_mixed";
    readonly name: "Multi-Vector: Memcached Amplification + HTTP Flood";
    readonly primaryVector: ZoneId;
    readonly attackType: "multi-vector";
    readonly impactChain: ZoneId[];
    readonly description: "A coordinated multi-vector attack combines memcached amplification (51,000x factor, 180 Gbps) with a simultaneous HTTP flood targeting specific API endpoints. The volumetric component saturates edge capacity while the HTTP flood bypasses simple rate limits by using rotating valid-looking request patterns. The combined attack creates a layered defense challenge: blocking the volumetric component alone is insufficient because the HTTP flood continues at L7.";
    readonly attackSignals: readonly ["MEMCACHED_AMPLIFICATION", "HTTP_FLOOD_L7", "MULTI_VECTOR_DETECTED", "DEFENSE_LAYER_BYPASS"];
    readonly flowSignals: {
        readonly udp_11211_traffic: "180 Gbps (memcached reflection)";
        readonly http_request_rate: "890K/sec (distributed across 42K source IPs)";
        readonly attack_coordination: "volumetric peaks correlate with HTTP flood surges";
    };
    readonly mitigationSequence: readonly [{
        readonly zone: ZoneId;
        readonly action: "block_udp_11211";
        readonly params: {};
        readonly description: "Block all UDP/11211 (memcached) traffic at the edge";
    }, {
        readonly zone: ZoneId;
        readonly action: "activate_scrubbing_center";
        readonly params: {
            readonly capacity_gbps: 500;
        };
        readonly description: "Route traffic through upstream scrubbing center";
    }, {
        readonly zone: ZoneId;
        readonly action: "deploy_js_challenge";
        readonly params: {
            readonly threshold_rps: 100;
        };
        readonly description: "Deploy JavaScript challenge for HTTP requests exceeding 100 rps per IP";
    }, {
        readonly zone: ZoneId;
        readonly action: "enable_request_fingerprinting";
        readonly params: {};
        readonly description: "Enable ML-based request fingerprinting to identify bot traffic patterns";
    }, {
        readonly zone: ZoneId;
        readonly action: "activate_priority_queue";
        readonly params: {
            readonly vip_only: true;
        };
        readonly description: "Switch to VIP-only order processing during mitigation";
    }, {
        readonly zone: ZoneId;
        readonly action: "reduce_snapshot_frequency";
        readonly params: {
            readonly interval_ms: 1000;
        };
        readonly description: "Reduce snapshot frequency to conserve bandwidth during attack";
    }];
    readonly diversion: {
        readonly zone: ZoneId;
        readonly symptom: "Kafka replication lag across all partitions";
        readonly actualCause: "Kafka cluster is experiencing network contention from the volumetric attack spilling into the internal network segment -- a side effect, not a direct attack on settlement";
    };
    readonly secondaryDiversion: {
        readonly zone: ZoneId;
        readonly symptom: "Order book depth decreased by 60% across all asset classes";
    };
    readonly onsetTimestamp: "T-2h";
}];
export type AttackScenarioId = "volumetric_syn_flood" | "slowloris_api_exhaustion" | "order_injection_dos" | "websocket_amplification" | "settlement_kafka_flood" | "dns_reflection_edge" | "api_credential_stuffing" | "memcached_amplification_mixed";
interface FlowLogEntry {
    ts: string;
    level: "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";
    zone: ZoneId;
    code: string;
    message: string;
    metadata: Record<string, unknown>;
}
interface FwTables {
    zone_config: Array<Record<string, unknown>>;
    network_topology: Array<Record<string, unknown>>;
    sla_targets: Array<Record<string, unknown>>;
    traffic_history: Array<Record<string, unknown>>;
    incident_history: Array<Record<string, unknown>>;
    firewall_rules: Array<Record<string, unknown>>;
    api_keys: Array<Record<string, unknown>>;
}
export interface SiegeGroundTruth {
    attackScenarioId: AttackScenarioId;
    attackScenarioName: string;
    primaryVector: ZoneId;
    attackType: string;
    impactChain: ZoneId[];
    mitigationSequence: Array<{
        zone: ZoneId;
        action: string;
        params: Record<string, unknown>;
    }>;
    diversion: {
        zone: ZoneId;
        symptom: string;
        actualCause: string;
    };
    attackSignals: readonly string[];
    flowSignals: Record<string, string>;
    seed: number;
}
export interface SiegeGeneratedData {
    objective: string;
    groundTruth: SiegeGroundTruth;
    scenario: typeof ATTACK_SCENARIOS[number];
    flowLogs: FlowLogEntry[];
    fwTables: FwTables;
    triageContext: Record<string, unknown>;
}
export declare function generateSiegeData(seed: number): SiegeGeneratedData;
export {};
