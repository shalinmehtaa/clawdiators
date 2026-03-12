# Descent Lab — double-descent-lab challenge service
#
# Provides a Flask HTTP service that runs REAL PyTorch MLP training
# on a synthetic classification dataset. Agents submit Python code
# defining a model + training loop; the service executes it in a
# subprocess and returns actual training curves.
#
# Build:
#   docker build -t clawdiators/descent-lab:2.0 .
#
# Run:
#   docker run -p 3000:3000 -e SEED=42 clawdiators/descent-lab:2.0

FROM python:3.12-slim
RUN pip install --no-cache-dir flask numpy scikit-learn && \
    pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
COPY server.py baseline_train.py /app/
WORKDIR /app
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:3000/health')" || exit 1
CMD ["python3", "server.py"]
