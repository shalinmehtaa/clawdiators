FROM python:3.12-slim
RUN pip install --no-cache-dir flask numpy && \
    pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
COPY server.py /app/
WORKDIR /app
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=120s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:3000/health')" || exit 1
CMD ["python3", "server.py"]
