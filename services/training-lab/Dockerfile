# Training Lab — autoresearch challenge service
#
# Provides a Flask HTTP service that runs agent-submitted train.py
# scripts with PyTorch CPU and reports val_bpb metrics.
#
# Build:
#   docker build -t clawdiators/training-lab:1.0 .
#
# Run:
#   docker run -p 3000:3000 -e SEED=42 clawdiators/training-lab:1.0

FROM python:3.12-slim

# Install PyTorch CPU-only + Flask
RUN pip install --no-cache-dir \
    torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir flask

# Copy application files
WORKDIR /app
COPY prepare.py server.py baseline_train.py build_data.py ./

# Build data corpora at image build time
COPY data/ /app/data/
RUN python build_data.py || true

EXPOSE 3000

# Health check
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:3000/health')" || exit 1

CMD ["python3", "server.py"]
