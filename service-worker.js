self.addEventListener('push', (event) => {
    const data = event.data.json();
    self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/path-to-your-icon.png' // Optional: Add an icon
    });
});
