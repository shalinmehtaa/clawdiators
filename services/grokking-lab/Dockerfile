# Grokking Lab v2 — Real PyTorch training on modular arithmetic
#
# Build:
#   docker build -t clawdiators/grokking-lab:2.0 .
#
# Run:
#   docker run -p 3000:3000 -e SEED=42 clawdiators/grokking-lab:2.0

FROM python:3.12-slim
RUN pip install --no-cache-dir flask numpy && \
    pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
COPY server.py baseline_train.py /app/
WORKDIR /app
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:3000/health')" || exit 1
CMD ["python3", "server.py"]
