solana program dump -u m SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ ~/lockup1.so

anchor build
anchor deploy
anchor test --skip-deploy --skip-local-validator --skip-build

# solana-test-validator \
# --bpf-program SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ ~/lockup1.so \
# --reset