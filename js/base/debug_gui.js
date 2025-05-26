class DebugGui {
    constructor() {
        this.gui = new GUI();
        this.gui.close();
        this.gui.add(this, 'close');
        this.gui.show(false);

        window.addEventListener('keydown', (event) => {
            if(event.key == 'c' || event.key == 'C')
                if (this.gui) this.gui.show(this.gui._hidden)
        })
    }
    
    close() {
        this.gui.destroy();
    }
}

export default DebugGui;
